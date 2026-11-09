-- Local validation only until a separately approved hosted deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Block project writers until validation and trigger installation are complete.
LOCK TABLE public.projects IN SHARE ROW EXCLUSIVE MODE;

-- Start from every row: root-only traversal would miss cyclic components.
DO $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE ancestry AS (
            SELECT p.user_id, p.id, p.parent_project_id,
                   ARRAY[p.id] AS path, false AS repeated
            FROM public.projects AS p
            UNION ALL
            SELECT a.user_id, p.id, p.parent_project_id,
                   pg_catalog.array_append(a.path, p.id), p.id = ANY(a.path)
            FROM ancestry AS a
            JOIN public.projects AS p
              ON p.id = a.parent_project_id AND p.user_id = a.user_id
            WHERE NOT a.repeated
        )
        SELECT 1 FROM ancestry WHERE repeated
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'Existing project hierarchy contains a cycle; migration aborted',
            HINT = 'Audit all projects and approve repairs separately. No relationships were changed.';
    END IF;
END;
$$;

-- Dedicated NOLOGIN function owner: no application role membership or BYPASSRLS.
-- A name collision aborts installation rather than adopting an unknown role/schema.
CREATE ROLE project_hierarchy_checker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA project_hierarchy_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA project_hierarchy_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE project_hierarchy_private.account_guards (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    revision bigint NOT NULL DEFAULT 0
);
ALTER TABLE project_hierarchy_private.account_guards OWNER TO postgres;
REVOKE ALL ON project_hierarchy_private.account_guards FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO project_hierarchy_private.account_guards (user_id)
SELECT DISTINCT user_id FROM public.projects;

GRANT USAGE ON SCHEMA public, project_hierarchy_private TO project_hierarchy_checker;
GRANT SELECT (id, user_id, parent_project_id) ON public.projects TO project_hierarchy_checker;
GRANT SELECT, INSERT ON project_hierarchy_private.account_guards TO project_hierarchy_checker;
GRANT UPDATE (revision) ON project_hierarchy_private.account_guards TO project_hierarchy_checker;
CREATE POLICY project_hierarchy_checker_read ON public.projects
    FOR SELECT TO project_hierarchy_checker USING (true);

CREATE FUNCTION project_hierarchy_private.enforce_acyclic_projects()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
SET row_security = on
AS $$
DECLARE
    invalid_ancestry boolean;
BEGIN
    -- Removing an edge cannot introduce a cycle. Also avoid guard writes during
    -- delete_project child promotion and auth.users ON DELETE CASCADE cleanup.
    IF NEW.parent_project_id IS NULL THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS NOT DISTINCT FROM OLD.id
           AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
           AND NEW.parent_project_id IS NOT DISTINCT FROM OLD.parent_project_id THEN
            RETURN NULL;
        END IF;
    END IF;

    -- This MUST write a row, not just acquire a lock. It creates a write conflict
    -- for older REPEATABLE READ/SERIALIZABLE snapshots, including first creation.
    INSERT INTO project_hierarchy_private.account_guards AS g (user_id, revision)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE SET revision = g.revision + 1;

    -- Separate SPI statement after the guard write/wait. VOLATILE obtains a fresh
    -- READ COMMITTED snapshot here; do not combine these statements in one CTE.
    WITH RECURSIVE ancestry AS (
        SELECT p.id, p.parent_project_id, ARRAY[p.id] AS path, false AS repeated
        FROM public.projects AS p
        WHERE p.id = NEW.parent_project_id AND p.user_id = NEW.user_id
        UNION ALL
        SELECT p.id, p.parent_project_id,
               pg_catalog.array_append(a.path, p.id), p.id = ANY(a.path)
        FROM ancestry AS a
        JOIN public.projects AS p
          ON p.id = a.parent_project_id AND p.user_id = NEW.user_id
        WHERE NOT a.repeated
    )
    SELECT EXISTS (SELECT 1 FROM ancestry WHERE id = NEW.id OR repeated)
    INTO invalid_ancestry;

    IF invalid_ancestry THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            CONSTRAINT = 'projects_hierarchy_acyclic',
            MESSAGE = 'A project cannot be placed beneath itself or a descendant';
    END IF;
    RETURN NULL;
END;
$$;

-- ALTER OWNER requires CREATE on the containing schema; remove it immediately.
GRANT CREATE ON SCHEMA project_hierarchy_private TO project_hierarchy_checker;
ALTER FUNCTION project_hierarchy_private.enforce_acyclic_projects() OWNER TO project_hierarchy_checker;
REVOKE CREATE ON SCHEMA project_hierarchy_private FROM project_hierarchy_checker;
REVOKE ALL ON FUNCTION project_hierarchy_private.enforce_acyclic_projects() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION project_hierarchy_private.enforce_acyclic_projects() TO postgres;

-- AFTER ROW sees the complete outer statement, including multi-row mutations.
-- All UPDATEs are considered so identity-affecting changes cannot bypass checks.
CREATE TRIGGER projects_hierarchy_acyclic
AFTER INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION project_hierarchy_private.enforce_acyclic_projects();

COMMIT;

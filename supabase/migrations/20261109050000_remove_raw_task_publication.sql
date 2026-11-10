-- Reviewed cutover only: API-only clients must already be deployed and verified.
-- No hosted execution is authorized by adding this file to source control.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.tasks IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
    approved_publication oid;
    publication_owner oid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE oid = 'public.tasks'::regclass AND relkind = 'r'
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_inherits
        WHERE inhrelid = 'public.tasks'::regclass OR inhparent = 'public.tasks'::regclass
    ) THEN
        RAISE EXCEPTION 'Unexpected tasks inheritance/partition topology; cutover aborted';
    END IF;

    -- ALL TABLES or schema-wide membership cannot be safely fixed by DROP TABLE.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE puballtables)
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_publication_namespace pn
           WHERE pn.pnnspid = 'public'::regnamespace
       ) OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_publication_tables
           WHERE schemaname = 'public' AND tablename = 'tasks'
             AND pubname <> 'supabase_realtime'
       ) THEN
        RAISE EXCEPTION 'Unexpected raw tasks publication topology; cutover aborted';
    END IF;

    SELECT oid, pubowner INTO approved_publication, publication_owner
    FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime';

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_rel
        WHERE prpubid = approved_publication AND prrelid = 'public.tasks'::regclass
    ) THEN
        IF EXISTS (
            SELECT 1 FROM pg_catalog.pg_publication_rel
            WHERE prpubid = approved_publication AND prrelid = 'public.tasks'::regclass
              AND (prqual IS NOT NULL OR prattrs IS NOT NULL)
        ) THEN
            RAISE EXCEPTION 'Unexpected filtered/column-limited raw task membership; cutover aborted';
        END IF;
        -- PostgreSQL requires publication ownership, not just task ownership.
        -- Do not assume CREATEROLE, ADMIN-only membership or a table grant suffices.
        IF NOT pg_catalog.pg_has_role(current_user, publication_owner, 'USAGE') THEN
            RAISE EXCEPTION USING ERRCODE = '42501',
                MESSAGE = 'Migration role lacks publication-owner privileges; cutover aborted';
        END IF;
        ALTER PUBLICATION supabase_realtime DROP TABLE public.tasks;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE schemaname = 'public' AND tablename = 'tasks'
    ) THEN
        RAISE EXCEPTION 'Raw tasks publication remains; cutover aborted';
    END IF;
END;
$$;
COMMIT;

-- Read-only, cycle-safe audit. Includes rootless cycles and affected descendants.
-- Run as a role able to read ALL projects; an RLS-filtered audit is incomplete.
WITH RECURSIVE ancestry AS (
    SELECT p.id AS start_id, p.user_id, p.id, p.parent_project_id,
           ARRAY[p.id] AS path, false AS repeated
    FROM public.projects AS p
    UNION ALL
    SELECT a.start_id, a.user_id, p.id, p.parent_project_id,
           pg_catalog.array_append(a.path, p.id), p.id = ANY(a.path)
    FROM ancestry AS a
    JOIN public.projects AS p
      ON p.id = a.parent_project_id AND p.user_id = a.user_id
    WHERE NOT a.repeated
)
SELECT start_id AS affected_project_id, user_id, path AS ancestry_with_cycle
FROM ancestry WHERE repeated
ORDER BY user_id, start_id;

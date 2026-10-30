ALTER TABLE public.tasks
    ADD COLUMN project_position numeric,
    ADD COLUMN planned_position numeric;

-- Initialize each project's task order.
-- NULL project_id represents the Inbox.

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, project_id
            ORDER BY created_at DESC, id ASC
        ) * 1000 AS position
    FROM public.tasks
)
UPDATE public.tasks AS task
SET project_position = ranked.position
FROM ranked
WHERE task.id = ranked.id;


-- Initialize daily ordering independently.
-- Use the planned date when available; otherwise use the due date.

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, COALESCE(planned_date, due_date)
            ORDER BY created_at DESC, id ASC
        ) * 1000 AS position
    FROM public.tasks
)
UPDATE public.tasks AS task
SET planned_position = ranked.position
FROM ranked
WHERE task.id = ranked.id;

SELECT
    title,
    project_position,
    planned_position
FROM public.tasks
WHERE title ILIKE '%Reorder%'
ORDER BY created_at DESC;
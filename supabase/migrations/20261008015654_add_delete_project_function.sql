CREATE OR REPLACE FUNCTION public.delete_project(
    p_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock the target and verify ownership.
    PERFORM 1
    FROM public.projects
    WHERE id = p_project_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found or access denied';
    END IF;

    -- Preserve child projects by promoting them to the root.
    UPDATE public.projects
    SET parent_project_id = NULL
    WHERE parent_project_id = p_project_id
      AND user_id = v_user_id;

    -- Preserve tasks by moving them to Inbox.
    UPDATE public.tasks
    SET project_id = NULL
    WHERE project_id = p_project_id
      AND user_id = v_user_id;


-- Delete only the selected project.
    DELETE FROM public.projects
    WHERE id = p_project_id
      AND user_id = v_user_id;
IF NOT FOUND THEN
        RAISE EXCEPTION 'Project deletion failed';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_project(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_project(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_project(uuid) TO authenticated;

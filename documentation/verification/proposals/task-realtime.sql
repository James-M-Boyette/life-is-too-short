-- REVIEW PROPOSAL ONLY. Documentation artifact, not an executable test/migration.
-- Equivalent publication/replica-identity changes were tested ONLY on disposable
-- local Supabase. Ownership-installation correction must be reviewed separately.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE EXCEPTION 'Expected Supabase Realtime publication is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
    END IF;
END;
$$;

-- Tested service version needs the deleted row's user_id to evaluate the app's
-- user_id filter. RLS still restricts outgoing DELETE old-row data to the PK.
-- Unfiltered subscribers can still receive foreign deletion IDs: review this
-- service limitation before accepting this proposal for deployment.
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
COMMIT;

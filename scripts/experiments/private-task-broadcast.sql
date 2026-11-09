-- DISPOSABLE PROOF ONLY. Never copied into supabase/migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='realtime' AND tablename='messages') THEN
        RAISE EXCEPTION 'Proof expects an audited fresh policy set; refusing to replace policies';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication_tables WHERE schemaname='public' AND tablename='tasks') THEN
        RAISE EXCEPTION 'Raw tasks publication would invalidate this privacy proof';
    END IF;
END;
$$;

CREATE POLICY proof_owner_receive ON realtime.messages FOR SELECT TO authenticated
USING (
    extension = 'broadcast'
    AND topic = 'task-invalidation:' || (SELECT auth.uid())::text
    AND (SELECT realtime.topic()) = 'task-invalidation:' || (SELECT auth.uid())::text
);
-- No client INSERT policy. The server-only role is justified by the denied
-- invoker send probe; it has no task SELECT, table ownership or BYPASSRLS.
CREATE ROLE task_notification_sender_proof NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE SCHEMA task_notification_proof AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA task_notification_proof FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA realtime, task_notification_proof TO task_notification_sender_proof;
GRANT EXECUTE ON FUNCTION realtime.send(jsonb,text,text,boolean) TO task_notification_sender_proof;
GRANT INSERT (id,payload,event,topic,private,extension) ON realtime.messages TO task_notification_sender_proof;
CREATE POLICY proof_server_send ON realtime.messages FOR INSERT TO task_notification_sender_proof
WITH CHECK (extension='broadcast' AND private AND topic LIKE 'task-invalidation:%' AND payload->>'v'='1');

CREATE FUNCTION task_notification_proof.notify_tasks() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET row_security = on
AS $$
DECLARE
    destination uuid;
    previous_topic text := pg_catalog.current_setting('realtime.topic',true);
BEGIN
    IF TG_OP = 'DELETE' THEN destination := OLD.user_id;
    ELSE destination := NEW.user_id;
    END IF;
    PERFORM realtime.send(pg_catalog.jsonb_build_object('v',1),'tasks_changed_v1',
        'task-invalidation:' || destination::text, true);
    IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
        PERFORM realtime.send(pg_catalog.jsonb_build_object('v',1),'tasks_changed_v1',
            'task-invalidation:' || OLD.user_id::text, true);
    END IF;
    PERFORM pg_catalog.set_config('realtime.topic',coalesce(previous_topic,''),true);
    RETURN NULL;
END;
$$;
GRANT CREATE ON SCHEMA task_notification_proof TO task_notification_sender_proof;
GRANT task_notification_sender_proof TO postgres WITH SET TRUE;
ALTER FUNCTION task_notification_proof.notify_tasks() OWNER TO task_notification_sender_proof;
REVOKE CREATE ON SCHEMA task_notification_proof FROM task_notification_sender_proof;
REVOKE ALL ON FUNCTION task_notification_proof.notify_tasks() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION task_notification_proof.notify_tasks() TO postgres;
CREATE TRIGGER proof_notify_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION task_notification_proof.notify_tasks();
REVOKE task_notification_sender_proof FROM postgres;
COMMIT;

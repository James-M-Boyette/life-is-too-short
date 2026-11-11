-- Private task invalidation. Hosted deployment requires separate approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.tasks, realtime.messages IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
    relation record;
    api_role text;
BEGIN
    IF pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL
       OR pg_catalog.to_regprocedure('realtime.topic()') IS NULL THEN
        RAISE EXCEPTION 'Required Supabase Broadcast signatures are missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        WHERE p.oid='realtime.send(jsonb,text,text,boolean)'::regprocedure
          AND NOT p.prosecdef AND p.prorettype='void'::regtype AND p.provolatile='v'
          AND pg_catalog.pg_get_userbyid(p.proowner)='supabase_realtime_admin'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        WHERE p.oid='realtime.topic()'::regprocedure AND NOT p.prosecdef
          AND p.prorettype='text'::regtype
    ) THEN
        RAISE EXCEPTION 'Unsupported Supabase Broadcast function security/signature';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE oid='realtime.messages'::regclass AND relrowsecurity
          AND pg_catalog.pg_get_userbyid(relowner)='supabase_realtime_admin'
    ) THEN
        RAISE EXCEPTION 'Unsupported Realtime messages ownership/RLS configuration';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='realtime' AND tablename='messages') THEN
        RAISE EXCEPTION 'Existing Realtime messages policies require review; installation aborted';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication_tables WHERE schemaname='public' AND tablename='tasks') THEN
        RAISE EXCEPTION 'Existing raw tasks publication requires review; installation aborted';
    END IF;
    -- Platform daily partitions bypass parent RLS on direct access. Refuse any
    -- existing effective API grants rather than silently revoking platform ACLs.
    FOR relation IN SELECT relid FROM pg_catalog.pg_partition_tree('realtime.messages'::regclass) WHERE level > 0 LOOP
        FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF pg_catalog.has_any_column_privilege(api_role,relation.relid,'SELECT,INSERT,UPDATE,REFERENCES')
               OR pg_catalog.has_table_privilege(api_role,relation.relid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN') THEN
                RAISE EXCEPTION 'Direct Realtime partition privileges require review; installation aborted';
            END IF;
        END LOOP;
    END LOOP;
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=api_role AND (rolsuper OR rolbypassrls))
           OR pg_catalog.has_table_privilege(api_role,'realtime.messages','TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
           OR pg_catalog.has_any_column_privilege(api_role,'realtime.messages','REFERENCES') THEN
            RAISE EXCEPTION 'Unsafe Realtime API-role privileges; installation aborted';
        END IF;
    END LOOP;
    -- Database-visible overrides only. Gateway environment settings are not
    -- queryable here and remain a separately required deployment audit.
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_db_role_setting d,
          LATERAL pg_catalog.unnest(d.setconfig) AS c(setting),
          LATERAL pg_catalog.regexp_split_to_table(pg_catalog.split_part(setting,'=',2),',') AS s(schema_name)
        WHERE setting LIKE 'pgrst.db_schemas=%'
          AND pg_catalog.btrim(schema_name,' "') IN ('realtime','task_notification_private')
    ) THEN
        RAISE EXCEPTION 'Private schema Data API exposure requires review; installation aborted';
    END IF;
END;
$$;

CREATE POLICY task_notifications_owner_receive ON realtime.messages FOR SELECT TO authenticated
USING (
    private = true
    AND extension = 'broadcast'
    AND topic = 'task-invalidation:' || (SELECT auth.uid())::text
    AND (SELECT realtime.topic()) = 'task-invalidation:' || (SELECT auth.uid())::text
);
-- Realtime v2.140 read authorization inserts a payload-free probe without a
-- private flag, then SELECTs it in the SAME transaction and rolls it back.
-- Normal/committed messages still require private=true above. Do not change
-- the platform column default or admit public message payloads to accommodate it.
CREATE POLICY task_notifications_authorization_probe ON realtime.messages FOR SELECT TO authenticated
USING (
    private = false AND extension = 'broadcast'
    AND payload IS NULL AND binary_payload IS NULL AND event IS NULL
    AND xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
    AND topic = 'task-invalidation:' || (SELECT auth.uid())::text
    AND (SELECT realtime.topic()) = 'task-invalidation:' || (SELECT auth.uid())::text
);
-- Restrictive defense remains effective if another publishing policy is added.
CREATE POLICY task_notifications_no_client_publish ON realtime.messages
AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (topic NOT LIKE 'task-invalidation:%');
-- No permissive client INSERT policy. The server-only role is justified by the denied
-- invoker send probe; it has no task SELECT, table ownership or BYPASSRLS.
CREATE ROLE task_notification_sender NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE SCHEMA task_notification_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA task_notification_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA realtime, task_notification_private TO task_notification_sender;
GRANT INSERT (id,payload,event,topic,private,extension) ON realtime.messages TO task_notification_sender;

-- EXECUTE can be inherited through PUBLIC without the migration role holding grant authority.
-- Verify effective permissions because GRANT can warn and apply only a subset.
DO $$
DECLARE
    required_column text;
BEGIN
    IF NOT pg_catalog.has_function_privilege(
        'task_notification_sender', 'realtime.send(jsonb,text,text,boolean)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Task notification sender lacks EXECUTE on realtime.send';
    END IF;

    IF NOT pg_catalog.has_schema_privilege('task_notification_sender', 'realtime', 'USAGE')
        OR NOT pg_catalog.has_schema_privilege('task_notification_sender', 'task_notification_private', 'USAGE')
    THEN
        RAISE EXCEPTION 'Task notification sender lacks required schema USAGE';
    END IF;

    FOREACH required_column IN ARRAY ARRAY['id','payload','event','topic','private','extension'] LOOP
        IF NOT pg_catalog.has_column_privilege(
            'task_notification_sender', 'realtime.messages', required_column, 'INSERT'
        ) THEN
            RAISE EXCEPTION 'Task notification sender lacks INSERT on realtime.messages.%', required_column;
        END IF;
    END LOOP;
END;
$$;
CREATE POLICY task_notifications_server_send ON realtime.messages FOR INSERT TO task_notification_sender
WITH CHECK (
    extension = 'broadcast' AND private = true AND event = 'tasks_changed_v1'
    AND topic ~ '^task-invalidation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND pg_catalog.jsonb_typeof(payload) = 'object'
    AND payload->'v' = '1'::jsonb
    AND pg_catalog.jsonb_typeof(payload->'id') = 'string'
    AND payload->>'id' = id::text
    AND payload - ARRAY['v','id']::text[] = '{}'::jsonb
);

CREATE FUNCTION task_notification_private.notify_tasks() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET row_security = on
AS $$
DECLARE
    destination uuid;
    previous_topic text := pg_catalog.current_setting('realtime.topic',true);
BEGIN
    IF TG_OP = 'DELETE' THEN destination := OLD.user_id;
    ELSE destination := NEW.user_id;
    END IF;
    BEGIN
        PERFORM realtime.send(pg_catalog.jsonb_build_object('v',1),'tasks_changed_v1',
            'task-invalidation:' || destination::text, true);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Task invalidation unavailable (SQLSTATE %)', SQLSTATE;
    END;
    IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
        BEGIN
            PERFORM realtime.send(pg_catalog.jsonb_build_object('v',1),'tasks_changed_v1',
                'task-invalidation:' || OLD.user_id::text, true);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Task invalidation unavailable (SQLSTATE %)', SQLSTATE;
        END;
    END IF;
    PERFORM pg_catalog.set_config('realtime.topic',coalesce(previous_topic,''),true);
    RETURN NULL;
END;
$$;
GRANT CREATE ON SCHEMA task_notification_private TO task_notification_sender;
GRANT task_notification_sender TO postgres WITH SET TRUE;
ALTER FUNCTION task_notification_private.notify_tasks() OWNER TO task_notification_sender;
REVOKE CREATE ON SCHEMA task_notification_private FROM task_notification_sender;
REVOKE ALL ON FUNCTION task_notification_private.notify_tasks() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION task_notification_private.notify_tasks() TO postgres;
CREATE TRIGGER notify_private_task_changes AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION task_notification_private.notify_tasks();
REVOKE task_notification_sender FROM postgres;
COMMIT;

-- OPERATOR PROPOSAL ONLY. Not executed against hosted Supabase.
-- Confirm project xvrcqlecgxmttrixvpln in the Dashboard before any connection.
-- Run EACH complete BEGIN...ROLLBACK block in ONE session/submission.
-- Stop on denied access, timeout, missing prerequisites or unexpected topology.
-- Keep catalog results private. Do not retrieve task content, emails or JWTs.

-- 1. Identity, migration status, ownership and ALL publication coverage.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SELECT current_database(), current_user, session_user, version();
SELECT rolname, rolsuper, rolcreaterole, rolinherit, rolbypassrls
FROM pg_roles WHERE rolname IN (current_user, session_user);
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT pubname, pg_get_userbyid(pubowner) AS owner, puballtables,
       pubinsert, pubupdate, pubdelete, pubtruncate, pubviaroot,
       pg_has_role(current_user, pubowner, 'USAGE') AS owner_rights_available_now,
       pg_has_role(current_user, pubowner, 'SET') AS owner_role_settable
FROM pg_publication ORDER BY pubname;
SELECT pubname, schemaname, tablename, attnames, rowfilter
FROM pg_publication_tables ORDER BY pubname, schemaname, tablename;
SELECT p.pubname, n.nspname AS published_schema
FROM pg_publication_namespace pn JOIN pg_publication p ON p.oid=pn.pnpubid
JOIN pg_namespace n ON n.oid=pn.pnnspid ORDER BY 1,2;
SELECT p.pubname, r.prrelid::regclass AS relation, r.prattrs,
       pg_get_expr(r.prqual,r.prrelid) AS row_filter
FROM pg_publication_rel r JOIN pg_publication p ON p.oid=r.prpubid
WHERE r.prrelid='public.tasks'::regclass ORDER BY 1;
SELECT c.oid::regclass, c.relkind, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relreplident,
       pg_has_role(current_user,c.relowner,'USAGE') AS table_owner_rights
FROM pg_class c WHERE c.oid IN ('public.tasks'::regclass,'public.projects'::regclass);
SELECT inhrelid::regclass, inhparent::regclass FROM pg_inherits
WHERE inhrelid='public.tasks'::regclass OR inhparent='public.tasks'::regclass;
ROLLBACK;

-- 2. Native Broadcast compatibility and object collisions. Definitions contain
-- platform code, not application rows; compare privately to tested native code.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SELECT to_regprocedure('realtime.send(jsonb,text,text,boolean)') AS send,
       to_regprocedure('realtime.topic()') AS topic,
       to_regprocedure('auth.uid()') AS auth_uid,
       to_regclass('realtime.messages') AS messages;
SELECT p.oid::regprocedure, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef, p.provolatile, p.prorettype::regtype, p.proconfig,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p WHERE p.oid IN (
    to_regprocedure('realtime.send(jsonb,text,text,boolean)'),
    to_regprocedure('realtime.topic()'),to_regprocedure('auth.uid()'));
SELECT n.nspname, pg_get_userbyid(n.nspowner) AS owner, n.nspacl
FROM pg_namespace n WHERE n.nspname IN ('realtime','task_notification_private');
SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolbypassrls
FROM pg_roles WHERE rolname IN ('task_notification_sender','supabase_realtime_admin');
SELECT to_regprocedure('task_notification_private.notify_tasks()') AS existing_sender;
SELECT tgname,tgenabled,pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.tasks'::regclass AND NOT tgisinternal;
SELECT attname,format_type(atttypid,atttypmod),attnotnull
FROM pg_attribute WHERE attrelid=to_regclass('realtime.messages')
AND attnum>0 AND NOT attisdropped ORDER BY attnum;
ROLLBACK;

-- 3. Run only after confirming realtime.messages exists. Inspect ALL descendants:
-- direct partition reads can bypass parent RLS. Missing visibility is NOT a pass.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SELECT c.oid::regclass,pt.level,pg_get_userbyid(c.relowner) AS owner,
       c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_partition_tree('realtime.messages'::regclass) pt
JOIN pg_class c ON c.oid=pt.relid ORDER BY pt.level,c.oid;
SELECT p.* FROM pg_policies p JOIN pg_namespace n ON n.nspname=p.schemaname
JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=p.tablename
WHERE c.oid IN (SELECT relid FROM pg_partition_tree('realtime.messages'::regclass))
ORDER BY schemaname,tablename,policyname;
SELECT r.rolname,pt.relid::regclass,pt.level,v.privilege,
       has_table_privilege(r.oid,pt.relid,v.privilege) AS effective
FROM pg_roles r CROSS JOIN pg_partition_tree('realtime.messages'::regclass) pt
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
                   ('REFERENCES'),('TRIGGER'),('MAINTAIN')) v(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role','postgres')
ORDER BY 1,2,4;
SELECT r.rolname,pt.relid::regclass,pt.level,
       has_any_column_privilege(r.oid,pt.relid,'SELECT,INSERT,UPDATE,REFERENCES') AS any_column_access
FROM pg_roles r CROSS JOIN pg_partition_tree('realtime.messages'::regclass) pt
WHERE r.rolname IN ('anon','authenticated') ORDER BY 1,2;
SELECT c.oid::regclass,a.attname,a.attacl FROM pg_attribute a
JOIN pg_class c ON c.oid=a.attrelid
WHERE a.attrelid IN (SELECT relid FROM pg_partition_tree('realtime.messages'::regclass))
AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL ORDER BY 1,2;
SELECT r.rolname,n.nspname,
       has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
       has_schema_privilege(r.oid,n.oid,'CREATE') AS create_right
FROM pg_roles r CROSS JOIN pg_namespace n
WHERE r.rolname IN ('anon','authenticated','service_role','postgres')
AND n.nspname IN ('public','realtime','task_notification_private') ORDER BY 1,2;
SELECT pg_get_userbyid(roleid) AS granted_role,pg_get_userbyid(member) AS member,
       pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option
FROM pg_auth_members ORDER BY 1,2;
SELECT pg_get_userbyid(d.defaclrole) AS creator,coalesce(n.nspname,'<global>') AS scope,
       d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3;
ROLLBACK;

-- 4. Database-visible exposure overrides and aggregate consumer clues ONLY.
-- Dashboard/gateway/native service versions and the two-user client inventory
-- are required separately; SQL cannot prove client build adoption or all consumers.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SELECT setdatabase,setrole,setting
FROM pg_db_role_setting d CROSS JOIN LATERAL unnest(d.setconfig) c(setting)
WHERE split_part(setting,'=',1) IN ('pgrst.db_schemas','pgrst.db_extra_search_path');
SELECT slot_name,plugin,slot_type,database,active FROM pg_replication_slots ORDER BY slot_name;
SELECT application_name,state,count(*) FROM pg_stat_replication GROUP BY 1,2 ORDER BY 1,2;
SELECT to_regclass('realtime.subscription') AS subscription_catalog;
SELECT column_name,data_type FROM information_schema.columns
WHERE table_schema='realtime' AND table_name='subscription' AND column_name='entity';
ROLLBACK;

-- OPTIONAL: only if the preceding catalog check confirms entity is regclass/oid
-- and aggregate inspection is approved. Do not select filters/claims/JWTs.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
SELECT count(*) AS recorded_raw_task_subscriptions
FROM realtime.subscription WHERE entity='public.tasks'::regclass;
ROLLBACK;

-- INDEPENDENT POST-REMOVAL CHECK: no task member anywhere, all other publication
-- definitions/members identical to the private pre-cutover snapshot. #75 absent.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
SELECT pubname,schemaname,tablename,attnames,rowfilter
FROM pg_publication_tables ORDER BY 1,2,3;
SELECT pubname,pg_get_userbyid(pubowner),puballtables,pubinsert,pubupdate,pubdelete,pubtruncate,pubviaroot
FROM pg_publication ORDER BY pubname;
SELECT count(*) AS remaining_raw_task_publications FROM pg_publication_tables
WHERE schemaname='public' AND tablename='tasks';
SELECT relreplident,relrowsecurity FROM pg_class WHERE oid='public.tasks'::regclass;
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT to_regnamespace('task_notification_private') AS broadcast_schema;
ROLLBACK;

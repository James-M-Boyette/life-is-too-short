# Proposed hosted preflight — READ ONLY, NOT EXECUTED

Prepared November 9, 2026 against source main `1e3d34d`. This is a planning appendix, **not authorization to connect**. An independently authorized operator must verify the project identity and read scope first. Do not open credential files, export keys/JWTs, query password columns, call application RPCs or perform test mutations as part of this preflight. Hold results privately; catalog/function definitions and account statistics can be sensitive.

Run one numbered block at a time, promptly closing a bounded read-only transaction:

**Submit the complete wrapper and its approved SELECT block together in the same database session/submission.** BEGIN, SET LOCAL, the queries and ROLLBACK must share that session for the read-only transaction and local timeouts to apply. Do not assume a SQL dashboard preserves a transaction across separately executed requests; if session continuity is not established, do not split the wrapper across submissions.

```sql
BEGIN READ ONLY;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = 'pg_catalog';
-- Paste ONE approved SELECT block below.
ROLLBACK;
```

These statements have been reviewed against checked-in SQL, **not executed against hosted or a new test database in this assignment**. A timeout, missing object, denied privilege or incomplete RLS visibility is an unresolved result, never a clean bill of health. Capture errors without forcing access. The later catalog blocks assume PostgreSQL 17; stop for compatibility review if version/object checks disagree. Do not hold a long catalog/data snapshot open during deployment.

## 1. Version, identity, prerequisites and migration history

```sql
SELECT current_database(), current_user, session_user,
       current_setting('server_version') AS server_version,
       current_setting('server_version_num') AS server_version_num;
SELECT rolname, rolsuper, rolcreaterole, rolinherit, rolbypassrls
FROM pg_roles WHERE rolname IN (current_user, session_user);
SELECT object_name, to_regclass(object_name) AS relation
FROM (VALUES ('public.tasks'), ('public.projects'), ('auth.users'),
             ('realtime.messages'), ('supabase_migrations.schema_migrations')) v(object_name);
SELECT to_regprocedure('auth.uid()') AS auth_uid,
       to_regprocedure('public.delete_project(uuid)') AS delete_project,
       to_regprocedure('realtime.send(jsonb,text,text,boolean)') AS send,
       to_regprocedure('realtime.topic()') AS topic;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
```

Only if the migration table exists:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'
ORDER BY ordinal_position;
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

If `statements` exists, the operator may privately inspect statements for disputed versions. A recorded version is not a file checksum, and SQL parser/line-ending differences make a raw-file digest incomparable to a statement-array digest. Compare runtime definitions/ownership as well. Missing ledger entries must not be “repaired” or baselined automatically.

## 2. Table shape, ownership, constraints, indexes and triggers

```sql
SELECT n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity, c.relreplident, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN ('tasks','projects'))
   OR n.nspname IN ('realtime','project_hierarchy_private','task_notification_private')
ORDER BY 1,2;
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('tasks','projects')
ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass AS relation, conname, contype, convalidated,
       pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint WHERE conrelid IN ('public.tasks'::regclass,'public.projects'::regclass)
ORDER BY 1,2;
SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('tasks','projects') ORDER BY 2,3;
SELECT tgrelid::regclass AS relation, tgname, tgenabled, tgisinternal,
       pg_get_triggerdef(oid, true) AS definition
FROM pg_trigger WHERE tgrelid IN ('public.tasks'::regclass,'public.projects'::regclass)
ORDER BY 1,2;
```

Compare to all seven source migrations, not merely column names: same-owner FKs, validated constraints, unique keys, trigger enablement and any unexpected rules/policies/functions matter. A reviewed schema-only export/diff can supplement these results **only with separately authorized access and redaction**, not by reading local deployment credentials now.

## 3. Complete hierarchy/data preflight and sizing

Require full approved table visibility first; ordinary user-RLS results cannot attest to all accounts:

```sql
SELECT row_security_active('public.projects'::regclass) AS projects_rls_for_auditor,
       row_security_active('public.tasks'::regclass) AS tasks_rls_for_auditor;
SELECT count(*) AS projects FROM public.projects;
SELECT count(*) AS tasks FROM public.tasks;
SELECT min(n) AS min_tasks, max(n) AS max_tasks, avg(n) AS mean_tasks,
       count(*) AS accounts_with_tasks,
       count(*) FILTER (WHERE n>1000) AS accounts_over_1000,
       count(*) FILTER (WHERE n>5000) AS accounts_over_5000
FROM (SELECT user_id, count(*) AS n FROM public.tasks GROUP BY user_id) s;
SELECT pg_total_relation_size('public.projects') AS project_bytes,
       pg_total_relation_size('public.tasks') AS task_bytes;
SELECT count(*) AS invalid_project_parent_edges
FROM public.projects p LEFT JOIN public.projects parent ON parent.id=p.parent_project_id
WHERE p.parent_project_id IS NOT NULL
  AND (parent.id IS NULL OR parent.user_id IS DISTINCT FROM p.user_id);
SELECT count(*) AS invalid_task_project_edges
FROM public.tasks t LEFT JOIN public.projects p ON p.id=t.project_id
WHERE t.project_id IS NOT NULL AND (p.id IS NULL OR p.user_id IS DISTINCT FROM t.user_id);
-- Only with separately approved auth-ID visibility; no emails/passwords selected.
SELECT 'projects' AS relation, count(*) AS orphan_owners
FROM public.projects p LEFT JOIN auth.users u ON u.id=p.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'tasks', count(*) FROM public.tasks t
LEFT JOIN auth.users u ON u.id=t.user_id WHERE u.id IS NULL;
```

All-row traversal below includes rootless cycles and paths entering cycles. **Read-only does not mean load-free:** recursive inspection can consume substantial CPU, memory and I/O, especially for large/deep graphs. Schedule it within an approved low-load window after reviewing sizing; keep the wrapper's bounded timeout. It has no artificial depth cutoff that could hide long cycles. A timeout or otherwise incomplete inspection is inconclusive: stop and review an isolated-copy strategy rather than reporting zero cycles or raising production timeouts casually.

```sql
WITH RECURSIVE ancestry AS (
  SELECT p.id AS start_id, p.user_id, p.id, p.parent_project_id,
         ARRAY[p.id] AS path, false AS repeated
  FROM public.projects p
  UNION ALL
  SELECT a.start_id, a.user_id, p.id, p.parent_project_id,
         array_append(a.path,p.id), p.id=ANY(a.path)
  FROM ancestry a JOIN public.projects p
    ON p.id=a.parent_project_id AND p.user_id=a.user_id
  WHERE NOT a.repeated
)
SELECT count(DISTINCT start_id) AS starts_reaching_a_cycle
FROM ancestry WHERE repeated;
```

Any invalid edge/cycle blocks installation and requires a separately approved repair; this plan does not repair data. Counts/aggregates avoid task content and user emails. They do not measure serialized API response size or concurrent active devices; those need approved canary/usage evidence later.

## 4. Effective grants, column grants, defaults, roles and RLS

PostgreSQL 17-specific privilege list includes MAINTAIN. Metadata alone must be interpreted with inheritance, PUBLIC grants, owner powers and enabled API paths.

```sql
WITH objects AS (
 SELECT c.oid, n.nspname||'.'||c.relname AS relation
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m') AND (
   (n.nspname='public' AND c.relname IN ('tasks','projects')) OR
   n.nspname IN ('realtime','project_hierarchy_private','task_notification_private'))
), roles AS (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
SELECT roles.rolname, o.relation, p.privilege,
       has_table_privilege(roles.rolname,o.oid,p.privilege) AS effective_table_privilege
FROM objects o CROSS JOIN roles CROSS JOIN
  (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
ORDER BY 1,2,3;
SELECT n.nspname, c.relname, a.attname, a.attacl
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
 AND (n.nspname IN ('realtime','project_hierarchy_private','task_notification_private')
      OR (n.nspname='public' AND c.relname IN ('tasks','projects')))
ORDER BY 1,2,3;
SELECT pg_get_userbyid(d.defaclrole) AS creator, coalesce(n.nspname,'<global>') AS scope,
       d.defaclobjtype, d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
ORDER BY 1,2,3;
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl
FROM pg_namespace WHERE nspname IN ('public','auth','realtime','graphql_public',
 'project_hierarchy_private','task_notification_private');
SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolreplication, rolbypassrls FROM pg_roles ORDER BY rolname;
SELECT pg_get_userbyid(roleid) AS granted_role, pg_get_userbyid(member) AS member,
       pg_get_userbyid(grantor) AS grantor, admin_option, inherit_option, set_option
FROM pg_auth_members ORDER BY 1,2;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname IN ('public','realtime','project_hierarchy_private','task_notification_private')
ORDER BY 1,2,3;
SELECT schemaname, sequencename, sequenceowner FROM pg_sequences WHERE schemaname='public';
SELECT r.rolname, c.oid::regclass AS sequence, c.relacl,
 has_sequence_privilege(r.oid,c.oid,'USAGE') AS usage,
 has_sequence_privilege(r.oid,c.oid,'SELECT') AS select_right,
 has_sequence_privilege(r.oid,c.oid,'UPDATE') AS update_right
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated','service_role')
 AND c.relkind='S' AND n.nspname='public';
SELECT r.rolname, n.nspname,
 has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
 has_schema_privilege(r.oid,n.oid,'CREATE') AS create_right
FROM pg_roles r CROSS JOIN pg_namespace n
WHERE r.rolname IN ('anon','authenticated','service_role')
 AND n.nspname IN ('public','realtime','project_hierarchy_private','task_notification_private');
```

For column-effective rights not captured by a table grant, run the same objects/roles CTE with `has_any_column_privilege(roles.rolname,o.oid,'SELECT,INSERT,UPDATE,REFERENCES')`; inspect exact column ACL entries/grantors and role memberships privately if true. Inspect grant options too, e.g. `aclexplode(relacl)`/`aclexplode(attacl)`; `is_grantable=true` and dependent onward grants matter to REVOKE RESTRICT. No public sequence is expected from the checked-in UUID-key schema; unexpected sequences/creators require review. Do not treat service_role as row-isolated merely because table privileges were narrowed.

Only when helper roles exist, an effective capability matrix (PG17) supplements direct membership rows:

```sql
SELECT a.rolname AS subject, h.rolname AS helper,
 pg_has_role(a.oid,h.oid,'MEMBER') AS member,
 pg_has_role(a.oid,h.oid,'SET') AS can_set,
 pg_has_role(a.oid,h.oid,'USAGE') AS inherits
FROM pg_roles a CROSS JOIN pg_roles h
WHERE a.rolname IN ('anon','authenticated','service_role','postgres')
 AND h.rolname IN ('project_hierarchy_checker','task_notification_sender');
```

Before first install, helper object/role name collisions are blockers, not objects to adopt/drop. After an already-recorded install, compare expected runtime state. Trusted migration-role ADMIN-only creator membership is distinct from residual SET/inherited authority; API roles must have neither membership nor effective helper capability.

## 5. Function signatures, security and intended entry points

```sql
SELECT n.nspname, p.oid::regprocedure AS signature, pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef, p.provolatile, p.proconfig, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','realtime','project_hierarchy_private','task_notification_private')
 OR (n.nspname='auth' AND p.proname='uid') ORDER BY 1,2;
SELECT r.rolname, p.oid::regprocedure AS signature,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN ('anon','authenticated','service_role')
 AND n.nspname IN ('public','realtime','project_hierarchy_private','task_notification_private')
ORDER BY 1,2;
SELECT p.oid::regprocedure AS signature, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('delete_project','set_updated_at'))
 OR (n.nspname='realtime' AND p.proname IN ('send','topic','broadcast_changes'))
 OR n.nspname IN ('project_hierarchy_private','task_notification_private');
```

Keep definitions private and redact any unexpected embedded secrets. Review unknown exposed SECURITY DEFINER functions/SQL wrappers, rather than invoking them. Confirm auth.uid dependency, delete_project ownership check/search_path/child-promotion/task-Inbox semantics, helper owner/limited rights, and native send/topic signatures and bodies. PUBLIC execution of invoker send is not itself permission to publish: the INSERT RLS boundary must also hold.

## 6. Publications, replica identity, partitions and exposure

```sql
SELECT pubname, pg_get_userbyid(pubowner) AS owner, puballtables,
       pubinsert, pubupdate, pubdelete, pubtruncate FROM pg_publication ORDER BY pubname;
SELECT pubname, schemaname, tablename FROM pg_publication_tables ORDER BY 1,2,3;
SELECT relname, relreplident FROM pg_class
WHERE oid IN ('public.tasks'::regclass,'public.projects'::regclass);
-- Only if block 1 confirmed realtime.messages exists:
SELECT t.relid::regclass AS relation, t.parentrelid::regclass AS parent,
       t.level, t.isleaf, c.relrowsecurity, c.relforcerowsecurity, c.relacl,
       pg_get_expr(c.relpartbound,c.oid) AS partition_bound
FROM pg_partition_tree('realtime.messages'::regclass) t JOIN pg_class c ON c.oid=t.relid
ORDER BY t.level,t.relid;
-- Filter settings: never dump complete role settings or JWT/credential GUCs.
SELECT d.setdatabase, d.setrole, setting
FROM pg_db_role_setting d CROSS JOIN LATERAL unnest(d.setconfig) c(setting)
WHERE split_part(setting,'=',1) IN ('pgrst.db_schemas','pgrst.db_extra_search_path','pgrst.db_max_rows');
```

Block 4 must cover **direct child-partition** privileges, not only messages parent RLS. Future partition creation/grants and retention are separate platform checks. Existing raw tasks membership in **any** publication (including ALL TABLES) blocks #75 as written. Catalog evidence does not authorize removal or prove old subscribers stopped; identify consumers and approve cutover separately. Do not run the historical publication/FULL proposal.

## 7. Contention observation (no cancellation or locking)

```sql
SELECT pid, usename, state, wait_event_type, wait_event, xact_start,
       pg_blocking_pids(pid) AS blockers
FROM pg_stat_activity
WHERE datname=current_database() AND pid<>pg_backend_pid();
```

No query text, bind parameters, connection passwords or tokens are requested. Restricted visibility is a limitation to record, not a reason to escalate without approval. Do not cancel backends or take migration locks during preflight.

## Dashboard/support evidence — cannot be inferred from SQL above

Obtain redacted read-only evidence, without revealing/copying API keys or connection strings:

- Correct project/organization, current plan, spend-cap state, actual Realtime project limits, peak connections, events/sec and message/rate-limit logs; monthly message/egress/compute usage and other projects sharing quotas.
- Effective Data API exposed schemas/max rows/search path, grant automation/default platform permissions, GraphQL enablement and callable wrappers. Empty DB-setting rows do not prove external gateway configuration is safe.
- Managed Realtime/GoTrue/PostgREST versions and native authorization-probe behavior, from supported platform version/log/support evidence. PostgreSQL extension versions are not those service versions.
- Current partitions/retention/creation health, backups/PITR availability, latest successful restore point, restore procedure and external Storage/configuration coverage.
- Actual Pages release/bundle hashes, active/cached client versions, signup/invitation policy relevant to cost exposure and beta device inventory.

Read-only inspection cannot prove allowed/denied writes, transactional rollback, trigger firing or live notification delivery. Those require separately approved fixture-based validation after installation (or an appropriately isolated target-matching rehearsal), not SQL role impersonation or destructive production probes in this assignment.

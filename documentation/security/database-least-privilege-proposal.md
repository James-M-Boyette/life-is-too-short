# Baseline privilege correction: inventory, proposal and isolated verification

> Follow-up: [historical local service verification](../verification/local-supabase-services.md) found an ownership-installation defect in #70. Its [controlled unreleased correction](../verification/hierarchy-migration-ownership.md) now passes installation/API gates without SQL rewriting. Task publication/DELETE delivery remain unresolved and separately scoped. Neither migration has been deployed to hosted Supabase.

## Status and scope

This is a locally implemented **proposal**, based on main after PR #70. PR #70's hierarchy migration is merged but has not been deployed to hosted Supabase. Neither that migration nor this candidate has been applied to hosted Supabase here. No hosted queries, data/grant/configuration changes, remote db push or deployment were performed.

Review artifacts:

- [Candidate additive migration](../../supabase/migrations/20261109040000_restrict_application_privileges.sql)
- [Executable isolated tests](../../scripts/test-database-privileges.py)
- [Actual before/after ACL inventory and test results](../verification/database-least-privilege-results.json)
- [Original finding](baseline-table-privileges.md)
- [PR #70 implementation and concurrency rationale](../verification/project-hierarchy-db-integrity.md)

## Required application operations

All production client table access is owned by `TasksStore` and `ProjectsStore`; no components issue Supabase table mutations. TasksStore selects all columns, inserts a client UUID, performs partial updates with returned rows, and deletes tasks. Its updates cover atomic title/description, completion/status, project assignment and manual positions, planned/due dates and daily ordering. ProjectsStore selects all project columns, inserts owner/name/parent with a generated UUID, updates name/parent, and invokes `delete_project(uuid)` for deletion. There is no direct project DELETE caller. Auth uses Supabase Auth endpoints; Realtime uses its existing subscription path. No frontend service-role client or application sequence call was found.

`SELECT *`, mutation RETURNING and client refreshes require SELECT. INSERT/UPDATE/DELETE remain subject to owner RLS. UUID defaults need no sequence grants. Column-scoped CRUD could be further restricted, but would couple this correction to evolving payload columns and is not introduced here; UPDATE remains constrained by existing RLS, FKs and hierarchy checks, not a new field-authorization model.

| Object / capability | Baseline effective access in isolated PG17 | Candidate access / rationale |
| --- | --- | --- |
| public.tasks | anon/authenticated/service_role: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | authenticated + service_role: SELECT, INSERT, UPDATE, DELETE; anon: none |
| public.projects | Same broad table access | authenticated: SELECT, INSERT, UPDATE; deletion only through RPC. service_role: CRUD retained for trusted operational compatibility; anon: none |
| public schema | USAGE to all three; no CREATE for those roles in fresh PG17 fixture | Preserve USAGE, explicitly remove CREATE including inherited PUBLIC path |
| public.delete_project(uuid) | authenticated and service_role EXECUTE; anon denied; owner postgres | Preserve authenticated/service_role EXECUTE, revoke PUBLIC/anon; body unchanged |
| public.set_updated_at() | PUBLIC and all three roles EXECUTE | Remove client/PUBLIC EXECUTE; existing task UPDATE trigger still runs |
| hierarchy private schema/table/function | Client roles denied; narrow helper grants | Unchanged; helper column-only project reads preserved |
| Existing public sequences | None | No existing sequence ACL changes needed |
| Future postgres-created public tables/sequences | Baseline defaults grant ALL to anon/authenticated/service_role | Remove those automatic grants, including PUBLIC grants; future migrations explicitly grant intended access |
| Future postgres-created public functions | Schema defaults grant EXECUTE to all three, plus PostgreSQL global implicit PUBLIC EXECUTE | Remove schema defaults; remove **global** postgres-created function PUBLIC EXECUTE (all schemas, future functions only) |

The machine-readable inventory uses `has_*_privilege` for effective access, not ACL strings alone. The helper's table-level SELECT flag is false because its project read rights are column grants. Owner rights, helper grants and application role boundaries are not conflated. PostgreSQL 17's MAINTAIN is included in the inventory and revoked with ALL, even though the older baseline did not spell it out.

## Current database authorization and functions

Both tables enable RLS with authenticated owner policies using `auth.uid()` for visibility and WITH CHECK. Composite project/task FKs prevent cross-account parent/assignment relationships. Project deletion still locks and verifies the target owner, promotes direct children to root, moves directly assigned tasks to Inbox and deletes only the selected project. Grandchildren remain attached to their parent. Direct authenticated project DELETE is deliberately removed so clients use this existing contract.

The hierarchy trigger's SECURITY DEFINER owner has only graph-column reads and required private guard writes, with a role-scoped SELECT policy. This migration does not revoke that helper's grants or change the trigger/function. Ordinary task timestamp triggers require no caller EXECUTE grant at invocation, verified by successful UPDATE after revocation. Neither current trigger helper is an intended public RPC.

service_role BYPASSRLS remains a trusted server capability; removing TRUNCATE does **not** make it tenant-restricted. Service-role CRUD can affect other accounts and must never be exposed in Angular. No role attributes, memberships, RLS policies, Auth setup or function bodies are rewritten.

## SQL exposure versus HTTP exposure

Baseline SQL access permits whole-table TRUNCATE despite RLS, and permits attaching an executable trigger or creating a foreign key where the caller can create a referencing table. TRIGGER/REFERENCES are not required for application CRUD; references can reveal existence through constraints. Table ownership is still required for operations such as disabling existing triggers or dropping someone else's table. The baseline does not grant that ownership.

PostgREST's documented [table routes](https://docs.postgrest.org/en/stable/references/api/tables_views.html) expose row operations, not arbitrary SQL or a generic TRUNCATE/CREATE TRIGGER endpoint. [RPC routes](https://docs.postgrest.org/en/stable/references/api/functions.html) can expose functions in configured schemas subject to privileges. There is no checked-in arbitrary-SQL or truncate RPC. Trigger-returning helpers are not useful ordinary RPC entry points. Thus the SQL finding alone does not prove a remotely exploitable TRUNCATE endpoint. It remains an unnecessary capability and a dangerous building block for future function/SQL exposure.

Checked-in exposed schemas are public and graphql_public, not project_hierarchy_private. No HTTP/API server, GoTrue JWT verifier, GraphQL extension or Realtime service was exercised by this fixture. Hosted endpoint reachability, effective role memberships and extension-specific behavior require separate verification.

## Proposed migration and default-privilege tradeoff

The candidate uses one transaction with 5s lock timeout and 60s statement timeout. It revokes exact existing application table grants and regrants only required privileges. Revokes use RESTRICT (default), not CASCADE; unexpected dependent grants should abort rather than silently alter additional objects. Only the two known public functions and public schema CREATE are adjusted. No blanket revocation on existing auth/extension functions or existing unrelated tables is attempted.

Default ACL changes are **creator-specific**: only postgres, matching the checked-in baseline. PostgreSQL's global PUBLIC function default cannot be canceled by a schema-only revoke; the global future-function change is intentional. Existing `auth.uid()` and Auth functions are not modified. Future migrations creating any postgres-owned function must explicitly grant intended callers. Future objects owned by other deployment roles may have different defaults and must be inventoried before deployment. See [PostgreSQL default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html) and [GRANT](https://www.postgresql.org/docs/17/sql-grant.html).

The local Supabase config leaves `auto_expose_new_tables` unset, with a comment describing automatic API grants. This PR does not change it or hosted settings. Confirm the actual platform's grant automation does not reintroduce grants after migrations; if it does, a separately reviewed configuration change is a deployment prerequisite. Closed defaults intentionally mean a future feature must explicitly grant its tables/RPCs.

## Isolated verification

Run `python scripts/test-database-privileges.py` (Python 3.11+, Docker and the cached PR #70 PostgreSQL image). It starts a unique disposable PostgreSQL 17.6 container with network none, no host ports, and no app secrets. It loads checked-in SQL with the same minimal auth.users/auth.uid fixture used in PR #70. Role tests use a non-superuser authenticator session. This simulates database role/owner behavior, not hosted Auth authentication. The authenticator is intentionally able to assume API roles like a trusted gateway; tests do not claim to verify JWT role issuance.

The harness first runs all **28 baseline check groups**, reproducing allowed anon/authenticated TRUNCATE in rollback-only transactions and recording effective grants. It applies the candidate and runs **30 candidate check groups**:

- Own-task SELECT/INSERT/UPDATE/DELETE and mutation RETURNING, all current mutation field categories, timestamp trigger, generated project UUID creation, rename and reparent/root moves.
- Cross-account reads/updates/deletes denied or zero rows; forged ownership and cross-owner references rejected.
- Authenticated direct project DELETE denied, existing owner-checking delete_project RPC succeeds; unauthorized RPC denied. Child promotion and task-to-Inbox semantics unchanged.
- anon/authenticated/service_role TRUNCATE, TRIGGER, REFERENCES and MAINTAIN privileges absent; actual TRUNCATE CASCADE, trigger creation, foreign-key creation, public table creation, protected table DROP and private guard access denied.
- Anonymous table reads/deletes and delete_project denied. Service-role cyclic updates still rejected. Application roles cannot assume the hierarchy helper, disable its trigger, or enter replica mode.
- Transactional future-object probes confirm no automatic API-role privileges on postgres-created tables/sequences/functions, including PUBLIC function EXECUTE in another schema. Probe objects are rolled back.
- PR #70 reciprocal and three-project concurrent-cycle schedules repeated under READ COMMITTED, REPEATABLE READ and SERIALIZABLE with existing/lazy guards; independent committed-graph audits remain acyclic.
- Deadlock/serialization rollback, bounded migration lock wait, independent-account guards, both deletion/reparent orderings and account-deletion guard cleanup repeated after ACL correction.

Schedules use independent connections and observed database blocking, not arbitrary sleeps. Baseline connections are closed before the second matrix to avoid exhausting PostgreSQL connection slots. A first REFERENCES probe used a temporary table, which PostgreSQL disallows referencing a permanent table; it was replaced with a dedicated fixture schema so the final denial specifically exercises permissions. Neither harness correction changes production behavior or weakens an assertion.

Angular verification: full suite **354 tests passed**, including project/session/async recovery regressions. Production build passed. Existing stylesheet warnings remain (TaskRow 7.62 kB, sidebar 4.31 kB); no budget errors. No new Angular tests or UI changes were needed. Final diff whitespace check passed.

## Deployment prerequisites, risks and rollback

Before a separately authorized deployment, obtain independent database/security review. Inventory hosted object ownership, table and column ACLs, grant options, role inheritance, PUBLIC/schema privileges, default ACLs for every actual creator, function signatures and API exposure. Unknown inherited/column/global grants can survive targeted table revocation; the tested baseline contains none providing an alternate path. Do not claim hosted least privilege until effective privilege checks pass there. Confirm no operational job depends on direct project DELETE, service-role maintenance privileges or implicit future grants.

PR #70 must be installed in order, with its complete cycle preflight and deployment authority confirmed. Neither migration is currently deployed. Test the entire chain in an isolated Supabase staging environment with actual Auth/API/Realtime and representative operations before production approval. Confirm Realtime row delivery after ACL changes; no subscription or publication changes are proposed. Refresh API schema cache through the normal platform migration process and test reconnecting clients.

Installation changes only privileges, not rows or deletion logic. On error the transaction rolls back; do not use CASCADE to force it through. Preserve an approved pre-deployment ACL/default-ACL snapshot. Prefer fix-forward explicit grants for a demonstrated missing capability. If rollback is required, restore only reviewed prior ACL/default entries from that snapshot in a bounded transaction; do not blindly reintroduce baseline GRANT ALL, rewrite RLS, or restore/delete user data. Reverting excess grants reopens the original finding.

Confirmed claims concern the checked-in schema and isolated PG17 environment only. Hosted privileges, grant automation, actual API endpoints and external operational clients remain unverified prerequisites, not evidence of an active exploit or permission to deploy.

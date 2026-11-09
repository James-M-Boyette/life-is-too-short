# F5: Project hierarchy database integrity — verification report

> Subsequent [full local Supabase verification](local-supabase-services.md) found that the normal non-superuser migration role cannot assign the helper-function owner as written. The superuser-fixture guarantees below do not establish installability through the actual Supabase CLI. PR #70 remains undeployed; see the follow-up report for the blocked gate and disposable-only correction experiment.

## Scope and deployment status

Implemented on `codex/project-hierarchy-db-integrity`, based on main after PR #69. This is an additive migration and isolated validation only. No hosted Supabase connection, deployment, remote db push, configuration change, or production-data operation was performed. Angular production code and existing CRUD APIs are unchanged.

Artifacts:

- [Migration](../../supabase/migrations/20261109020000_enforce_project_hierarchy_integrity.sql)
- [Read-only preflight](../../supabase/tests/project-hierarchy/preflight.sql)
- [Executable database harness](../../scripts/test-project-hierarchy-db.py)
- [Actual database results](project-hierarchy-db-integrity-results.json)
- [Separate baseline privilege finding](../security/baseline-table-privileges.md)

## Implementation and invariants

An ordinary immediate AFTER ROW trigger handles INSERT and UPDATE. It checks changed parent, identity, and ownership fields, including multi-row statements and upserts. Edge removal and name-only updates need no guard write. Existing ownership FKs, RLS, frontend ancestor checks, task ownership, and `delete_project` remain intact.

For an added/changed non-null edge, the VOLATILE PL/pgSQL function first INSERTs or UPDATEs the account's private guard row. The revision increment is an actual write, not a lock-only operation. A **separate SQL statement** then traverses ancestry, stopping and rejecting if it reaches the changed project or repeats an ancestor. It raises SQLSTATE `23514` with constraint name `projects_hierarchy_acyclic`.

At READ COMMITTED, the guard serializes conflicting account changes and the following statement sees a fresh snapshot. At REPEATABLE READ/SERIALIZABLE, a stale snapshot encountering a guard version committed since its snapshot fails with `40001`; it cannot safely continue using stale ancestry. A lazily created guard has the same conflict protection through its primary key. Different accounts use different rows. Competing project row locks can cause `40P01`; abort and retry the whole transaction, never only the final statement.

PostgreSQL documents [VOLATILE query snapshots](https://www.postgresql.org/docs/17/xfunc-volatility.html) and [isolation/retry semantics](https://www.postgresql.org/docs/17/transaction-iso.html). The schedules below validate the specific trigger on PostgreSQL 17.6 rather than relying on documentation alone.

## Privileges

The private schema is absent from checked-in Data API exposed schemas. Explicit revokes cover PUBLIC, anon, authenticated, and service_role on new objects. No public-schema default GRANT ALL is copied.

The SECURITY DEFINER owner is a dedicated NOLOGIN, NOINHERIT, NOBYPASSRLS, non-superuser database helper role, not an application identity/administrator role. Application roles have no membership. Its grants are limited to reading project graph columns, a SELECT RLS policy scoped to that role, schema usage, guard SELECT/INSERT, and guard revision UPDATE. It cannot read project names, update projects, delete guards, or create schema objects. The function has an empty search_path and qualified relations; application EXECUTE is revoked. Service-role DML still encounters the trigger despite bypassing RLS.

Database owners/superusers remain trusted: they can disable triggers or change grants. This is not a defense against a compromised database administrator. The baseline TRUNCATE exposure is separately documented, not resolved here.

## Actual isolated test environment

Run:

```powershell
python scripts/test-project-hierarchy-db.py --report documentation/verification/project-hierarchy-db-integrity-results.json
```

Requires Python 3.11+, Docker and the local image `public.ecr.aws/supabase/postgres:17.6.1.063`. The harness starts a disposable PostgreSQL **17.6** cluster inside a uniquely named, labeled container with **network none and no published ports**. It does not use app URLs, credentials, or existing local Supabase containers. Cleanup removes only its own labeled container.

The cluster loads checked-in baseline migrations with a minimal `auth.users` / `auth.uid()` fixture. Application tests connect as a non-superuser NOINHERIT authenticator and assume only anon/authenticated/service_role. They do not retain a superuser session authority. An initial harness-only role-switch assertion exposed that distinction and was corrected before recording these results. Real GoTrue JWT verification, PostgREST routing, hosted role membership/default privileges and deployment authority are outside this fixture.

Connections are independent persistent psql backends. Threads submit concurrent SQL; observed `pg_blocking_pids()` relationships establish ordering before committing blockers. No arbitrary timing delay establishes correctness. An independent Python graph walk reads every committed project after each recorded group, checking cycles, missing parents, and ownership. Intentionally corrupt fixtures are confined to disposable databases and cleaned before normal audits.

## Tested schedules and outcomes

**28 database check groups passed.** The JSON records exact edge outcomes and post-case audit row counts.

| Schedule | Observed outcome |
| --- | --- |
| Existing rootless two-project cycle before installation | Complete all-row preflight detects both; migration aborts `23514`; relationships unchanged; no helper role/schema installed. |
| Sequential create, rename, valid reparent/root move | Success; self, reciprocal, and longer cycles rejected `23514`; failed guard increments roll back. |
| Multi-row INSERT/UPDATE and upsert | Valid graphs succeed; cyclic statements roll back completely. |
| Deliberately corrupt ancestry, installed trigger restored | Repeated-ancestor traversal terminates and rejects a new edge into that component. |
| Two connections: A→B held, B→A blocked; first commits | READ COMMITTED: second rejects `23514`. REPEATABLE READ and SERIALIZABLE: second rejects `40001`. All three levels tested with existing and first-created guard (6 schedules). |
| Three connections: A→B held; B→C and C→A waiting; release first | READ COMMITTED: one waiter commits and cycle-closing waiter rejects `23514`. REPEATABLE READ/SERIALIZABLE: both older waiters reject `40001`. Existing/lazy guard at each level (6 schedules); which RC waiter wins is intentionally unspecified. |
| RR transaction writes name, then conflicting hierarchy change | `40001`; rollback restores earlier name and edge state. |
| Two transactions each hold a project row; guard holder waits for other row, other requests first row | `40P01` victim rolls back earlier name writes; survivor commits; independent audit acyclic. |
| Project writer blocks migration installation | Observed lock wait; bounded 5s timeout `55P03`; installation transaction aborted. |
| One account guard held, different account changes hierarchy | Other account succeeds without sharing guard. |
| delete_project | Direct tasks become Inbox, immediate children promoted to root, grandchildren and their tasks retained. |
| Deletion held, concurrent reparent under deleted project waits | Delete commits; reparent fails FK `23503`; no orphan/cycle. |
| Reparent held, delete waits on project FK lock | Reparent commits; delete promotes newly attached child correctly. |
| Auth/anon/service-role permission checks | Cross-account DML/RPC denied or affects zero rows; private objects/role assumption denied; authenticated trigger disabling/replica mode denied; service-role cycle rejected by trigger. |
| Helper owner capabilities | Graph-only reads and required guard access; no project-name read, project writes, guard deletion, schema CREATE, login, CREATEROLE or BYPASSRLS. |
| Account deletion | Existing auth cascade deletes projects and account guard without recreating guard. |

No tested concurrent schedule committed a cycle. Deadlock/serialization tests explicitly verify prior writes are rolled back, not merely that an exception occurred.

## Installation, preflight, recovery and rollback

The migration is explicitly transactional. A SHARE ROW EXCLUSIVE projects lock blocks structural writers (and other project writers) during final all-row validation, guard backfill, and trigger installation. `lock_timeout=5s` bounds lock waits and `statement_timeout=60s` bounds work. The traversal starts from every project, including rootless components and paths entering cycles; repeated ancestors terminate traversal. Preexisting cycles abort rather than repair/delete/reparent data. Long/deep graphs may exceed the statement budget and abort safely; assess runtime on a representative isolated copy before deployment.

Before a separately authorized deployment: independently review SQL/privileges, verify actual hosted PostgreSQL version and role capabilities, confirm the helper schema is not exposed, run the preflight with full project visibility, assess size/lock contention, and arrange a short write-maintenance window. Installation requires authority to create a NOLOGIN role and manage table policies/grants; this was available in the isolated cluster but has not been verified on hosted Supabase. Name collisions deliberately abort rather than adopting unknown objects. Confirm the chosen migration runner respects the transaction and aborts on SQL errors.

On timeout/preflight/error, roll back the whole transaction and investigate; do not automatically repair data. Any approved correction of existing cycles is a separate explicit data operation. Prefer a fix-forward migration after successful installation.

If removal is separately approved, freeze structural writes, take a backup, and use one bounded transaction to lock projects, drop only the new trigger, function, helper SELECT policy, guard table and private schema, revoke only the helper's graph/schema grants, then drop the dedicated helper role after confirming no remaining dependencies. Do not use DROP ... CASCADE or touch project/task rows, baseline RLS, ownership FKs, or delete_project. Guard revisions are coordination metadata only. Removing enforcement reopens F5; keep writes frozen until an alternative is installed. Existing accepted hierarchy data requires no conversion or restoration.

## Angular compatibility and verification

No changes to ProjectsStore, editors, dialogs or persistence APIs. Existing validation and error presentation remain. The generic hierarchy `23514` message is suitable for existing project-save feedback. A future narrow mapping could translate `40001`/`40P01` into “Project hierarchy changed concurrently. Retry your change”; no automatic whole-transaction retry or new notification layer is introduced here. Failed transactions do not partially persist edges or task changes.

- Targeted project/editor/dialog/shell tests: **73 passed**, 6 files.
- Full automated suite: **354 passed**, 24 files, including F1–F4 regressions.
- `pnpm exec ng build --configuration production`: passed.
- Existing stylesheet warnings remain: TaskRow 7.62 kB and AppSidebar 4.31 kB against 4 kB warning thresholds; no budget error or style changes.
- Existing reactive-form disabled-attribute and JSDOM navigation diagnostics appeared in tests; no failed tests.
- Diff whitespace check: passed before commit.

## Limits and independent review

These results establish the checked-in migration's behavior in the specified isolated PostgreSQL environment and tested schedules. They do not attest to deployed Supabase schema/permissions, arbitrary administrator behavior, production data validity, API exposure, or large-graph performance. Hosted deployment is **not approved or performed**. Independent database/security review is recommended before any deployment, especially the fresh-snapshot/guard ordering and effective hosted privileges. No UI/browser check was necessary for unchanged Angular behavior; actual hosted API integration remains a future separately authorized staging task.

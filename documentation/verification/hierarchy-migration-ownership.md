# Hierarchy migration ownership: controlled amendment and verification

## Status and authorization boundary

This focused correction is based on main `178df34`, which contains merged PR #72. The user explicitly confirmed that PRs #70/#71 have not been deployed to hosted Supabase and authorized amending the unreleased hierarchy migration. The checked-in reports record the same deployment status. No hosted system was queried to independently verify it: hosted access/deployment remains prohibited and was not performed.

This PR authorizes neither hosted deployment nor a broader migration repair. Realtime publication, replica identity, deletion-ID exposure and TasksStore's subscription lifecycle remain unresolved and unchanged.

## Original failure and exact correction

The [PR #72 pre-correction reproduction](local-supabase-services-original-results.json) is retained unchanged. Real local PostgreSQL 17.11, through Supabase CLI 2.120.0, returned SQLSTATE 42501 at ALTER FUNCTION OWNER: the non-superuser postgres migration role could not SET ROLE to project_hierarchy_checker. The earlier superuser fixture did not catch this restriction.

Only two executable statements are added to `20261109020000_enforce_project_hierarchy_integrity.sql`:

```sql
-- Immediately before transferring function ownership:
GRANT project_hierarchy_checker TO postgres WITH SET TRUE;

-- After existing privilege hardening/trigger installation, before COMMIT:
REVOKE project_hierarchy_checker FROM postgres;
```

The trusted migration role temporarily has the membership needed for ownership transfer and subsequent owner-privilege hardening. The membership is transaction-local in lifetime, not a permanent privilege. On success it is explicitly revoked before COMMIT; on SQL failure the encompassing transaction rolls back. The helper remains the NOLOGIN, non-superuser, NOBYPASSRLS owner. Its graph-column SELECT policy/grants, guard rights, empty function search_path, row_security setting, VOLATILE ancestry validation, trigger timing, RLS, timeout/locking/preflight and project/task deletion behavior are unchanged. #71 is unchanged.

This follows PostgreSQL's distinction between [SET and inherited role privileges](https://www.postgresql.org/docs/17/role-membership.html). No helper membership is granted to anon, authenticated or service_role, and no new permanent elevated owner is used.

## Migration-history decision and already-applied environments

A later migration cannot fix a fresh installation that fails before reaching it. This is an explicitly reviewed amendment to the still-unreleased #70 installation, with its existing version/order retained, rather than an ineffective later patch. The original pre-correction SQL remains recoverable from main commit `178df34` (Git blob prefix `f4c5f9b`); historical result JSON from PR #72 is not rewritten.

**Undeployed to hosted production does not mean never applied anywhere.** Known examples include the PR #70/#71 superuser fixtures and PR #72 disposable ownership experiments. Other developer, disposable or shared environments may also have applied either form.

| Existing environment state | Required handling |
| --- | --- |
| Fresh/unapplied | Install the amended checked-in chain normally; no manual grants should be needed. |
| Previous #70 failed transactionally and is not recorded | Verify rollback, no leftover helper objects/membership, and actual migration ledger; then apply the corrected chain. Investigate partial/manual changes rather than assuming pristine state. |
| Previous #70 succeeded under a superuser or experimental correction | The CLI may skip its already-recorded version; changing the file does not rerun it or prove its checksum/content was applied. Inspect function owner/body/config, helper attributes/grants, API-role membership and trusted-role SET/inheritance. Successful older installations may already have the same final runtime state; this correction changes installation authority, not the function body. |
| Disposable, positively owned test environment | Recreate only that disposable environment if needed, as the test harness does. Do not reset another developer's database. |
| Shared environment or one containing user data | Back up and record the original migration version/content provenance, inspect effective state, then separately review any necessary reconciliation. Do not rerun the CREATE ROLE/schema/table statements, drop the guard, remove migration records, use migration repair to pretend SQL ran, or blindly reapply this file. |

Any actual residual grant found outside these tests needs a scoped, authorized reconciliation, not an assumption that merging this file removes it. Future hosted rollout must inventory migration history, ownership and privileges, approve a deployment/recovery plan and retain the existing cycle preflight. This PR supplies no such approval.

## Harness correction

The local integration harness now copies **actual checked-in SQL bytes**; its temporary SQL rewriting path is removed. The old `--ownership-experiment` option is rejected rather than silently adding a second grant/revoke pair. Historical reports remain labeled as pre-correction evidence.

Two independently passing installation/API gates are available:

```powershell
node scripts/test-local-supabase-services.mjs --installation-only
node scripts/test-local-supabase-services.mjs --installation-only --full-chain-start
```

The first starts a new disposable local Supabase stack with baseline migrations, authenticates test users, then applies #70 and #71 through `migration up --local` while services/sessions are live. The second creates another new stack with **all six checked-in migrations present before `supabase start`**, proving a cold full-chain install. The subsequent migration-up checks confirm the already-recorded versions without replaying them.

Both record SHA-256 values of the actual checkout bytes, assert all six copied files are byte-identical, and compare all recorded versions in `supabase_migrations.schema_migrations` with the checked-in chain. Hashes are provenance for this checkout; CRLF/LF differences can change byte hashes without changing SQL semantics.

`--installation-only` skips the existing separate Realtime diagnostics entirely, including their publication/FULL/service-restart experiments. It records Realtime coverage as not tested and asserts publication membership/replica identity remain unchanged. A passing gate means **installation and API compatibility**, not full-service or hosted readiness. The broader default diagnostic remains separate and may fail on unresolved Realtime findings.

Safeguards from PR #72 remain: unique manifest-verified project IDs under ignored tmp/, alternate 563xx ports, no seed/user database reuse, no linked workspaces, loopback-only API URLs, random disposable Auth accounts, no application credential-file access, and cleanup of only the owned stack with stop --no-backup. No existing application local stack was reset or migrated. No hosted credentials were read.

## Observed security state after installation

The real local migration role was `postgres`, `rolsuper=false`, `rolcreaterole=true`.

| Subject | Observed state in both local gates |
| --- | --- |
| Helper function owner | project_hierarchy_checker |
| Function security | VOLATILE, SECURITY DEFINER, `search_path=""`, `row_security=on` |
| Helper role | NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB |
| Helper project access | SELECT id/user_id/parent_project_id; no SELECT name and no project UPDATE |
| Helper guard access | SELECT/INSERT, UPDATE revision; no DELETE or schema CREATE |
| anon/authenticated/service_role | No MEMBER, SET or inherited USAGE in helper; no private-schema USAGE or helper-function EXECUTE |
| Trusted postgres migration role | No residual SET or inherited USAGE in helper |
| PG17 automatic creator membership | Grantor supabase_admin; ADMIN=true, INHERIT=false, SET=false |

The retained ADMIN-only creator grant is distinct from the explicit temporary grant made by postgres. It does not automatically convey object privileges or SET ROLE. It permits the already-trusted CREATEROLE migration role to administer the role; this is not an application authorization capability. Database owners/administrators remain trusted and can change grants. Assertions use effective pg_has_role capabilities, not just absence of one direct ACL row.

## Executed verification

- [Staged local installation/API result](local-supabase-services-installation-results.json): **passed**, 12 check groups, no defects or SQL-rewrite experiments.
- [Cold full-chain installation/API result](local-supabase-services-fresh-installation-results.json): **passed**, 12 check groups, all six CLI migration versions recorded.
- Both used PostgreSQL 17.11, GoTrue v2.197.0, PostgREST v16.4 and Realtime v2.140.10 containers with CLI 2.120.0. Realtime ran as a service but no subscription tests or publication/replica changes were performed.
- Real GoTrue signup/login/refresh/logout and revoked refresh-token behavior passed. Real authenticated task content/completion/order/scheduling/assignment/delete contracts, project create/rename/reparent, cycle rejection, cross-account/anonymous denial, direct project DELETE denial and private-schema API denial passed.
- Real delete_project RPC passed with its existing ownership checks, direct-task Inbox preservation, child promotion and unchanged grandchild relationships. Existing timestamp/RLS dependencies and explicit future-function grant/schema reload probes passed.
- `python scripts/test-database-privileges.py`: **28 baseline + 30 restricted-ACL check groups passed**, including the retained deterministic independent-connection concurrency matrix, deadlock/serialization rollback and account cleanup. [This run's results](hierarchy-ownership-concurrency-results.json) are separate from prior historical reports. These independent tests still use isolated PostgreSQL 17.6 and were not replaced by API smoke tests.
- `pnpm exec ng test --watch=false`: **354 tests in 24 files passed**.
- `pnpm exec ng build --configuration production`: passed. Existing style warnings remain: TaskRow 7.62 kB and sidebar 4.31 kB against 4 kB warning thresholds; no error-budget failure.
- `node --check scripts/test-local-supabase-services.mjs` and `git diff --check`: passed before commit.

No Angular tests were added: frontend behavior is unchanged, and the regression is protected at the actual database/CLI installation boundary plus the existing suites.

## Remaining risks and review

The original Realtime publication, filtered DELETE/replica identity, hot-reconnect and deletion-UUID metadata findings remain open. Local role/grant behavior does not attest to hosted versions, customized memberships/default grants, current data or deployment tools. Other environments that already applied #70 require the explicit history/state review above. Recommend independent database/security review of this privileged but bounded installation amendment before any separately approved hosted rollout.

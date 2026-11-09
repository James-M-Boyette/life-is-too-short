# PR #70/#71: full local Supabase integration verification

## Decision: deployment is blocked

The unmodified migration chain **does not install through the normal local Supabase CLI**. PR #70 fails when assigning the trigger-function owner because the real `postgres` role is not a superuser and cannot SET ROLE to the new helper. PR #71 compatibility and application-service behavior were investigated only after an explicitly labeled disposable-copy ownership experiment. Those conditional results do not turn the original chain into a passing deployment candidate.

Fresh local installation also has no tasks membership in `supabase_realtime`. After a disposable-only publication change and Realtime restart, INSERT/UPDATE worked, but the current app filter missed DELETE with default replica identity. A further disposable-only REPLICA IDENTITY FULL experiment delivered filtered INSERT/UPDATE/DELETE and reconnection events.

No hosted Supabase access, hosted credentials, production data/configuration/grants, remote db push or deployment were used. Checked-in migration history and production Angular code remain unchanged. PRs #70/#71 are merged but remain **undeployed to hosted Supabase**.

## Reproduction and safety

Run from the repository root:

```powershell
node scripts/test-local-supabase-services.mjs
node scripts/test-local-supabase-services.mjs --ownership-experiment
python scripts/test-database-privileges.py
pnpm exec ng test --watch=false
pnpm exec ng build --configuration production
git diff --check
```

The first command is expected to exit nonzero at the original installation defect. The second also exits nonzero because it records remaining baseline/service defects even though later diagnostic experiments succeed. This is a failing compatibility gate with conditional successes, not an all-green integration suite.

The integration script uses the repository's installed Supabase CLI and SDK, not a new test framework. Node 22.16.0 and CLI 2.120.0 were used. It creates a unique `lits-integration-<random>` project under ignored `tmp/`, uses ports 563xx instead of the application's existing 543xx ports, copies only checked-in migrations, skips seed data, and obtains **local** API keys from local CLI status into memory. API access asserts loopback port 56321. Test accounts use randomly generated local-only emails/passwords. No environment credential file is read or rewritten.

An existing `life-is-too-short` local stack was inventoried and left running. No reset, stop, migration, SQL or API test targeted it. Each test stack has separate containers/network/volumes. Cleanup uses `supabase stop --no-backup` only in its manifest-verified workspace. The optional `--workdir tmp/<owned-workspace>` requires the matching test manifest and rejects linked projects; `--keep-stack` exists only for diagnosing that owned disposable stack. Do not use these options to adopt an application database. The baseline CLI start during initial investigation started optional services too; later automated runs excluded Studio/storage/analytics/edge services. PostgreSQL, GoTrue, PostgREST, Realtime, Kong and local mail service were real running containers in both cases.

Raw local CLI logs/keys and generated workspaces are ignored, not committed. Results contain version information, local IDs, system statuses and SQLSTATEs, not passwords/access tokens/API keys.

## Actual service environment

| Service | Tested version |
| --- | --- |
| PostgreSQL | 17.11; `public.ecr.aws/supabase/postgres:17.11.0.004` |
| GoTrue | v2.197.0 |
| PostgREST | v16.4 |
| Realtime | v2.140.10 |
| Kong | 2.8.1 |
| Supabase CLI / Node | 2.120.0 / 22.16.0 |

The CLI downloaded the required local images; it was not upgraded. This differs from the original minimal fixture's PostgreSQL 17.6 and NOLOGIN API-role approximations. Here real GoTrue issues JWTs, the real authenticator/PostgREST role context executes requests, real Auth schema/functions exist, and Realtime performs actual websocket/WAL delivery. The real local migration role reported `postgres|rolsuper=false|rolcreaterole=true`.

Checked-in configuration was copied with only a unique project ID, alternate local ports and empty seed list. Exposed schemas remain public/graphql_public. Email confirmation is disabled in the copied local configuration, permitting disposable signup; no hosted Auth policy was inferred or changed.

## Confirmed findings

### 1. PR #70 ownership assignment fails under the real migration role

Original CLI command: `migration up --local` in the disposable workspace. PostgreSQL returned:

```text
ERROR: must be able to SET ROLE "project_hierarchy_checker" (SQLSTATE 42501)
ALTER FUNCTION project_hierarchy_private.enforce_acyclic_projects() OWNER TO project_hierarchy_checker
```

This is recorded in [original results](local-supabase-services-original-results.json). The earlier superuser fixture did not establish deployability under Supabase's restricted `postgres` role. The failed installation transaction must be rolled back; do not force partial installation or proceed to #71 alone.

**Focused correction proposal:** in a separately reviewed correction to the still-unreleased #70 installation, temporarily grant the newly created role to the trusted migration role before ALTER OWNER, then revoke that grant before COMMIT:

```sql
GRANT project_hierarchy_checker TO postgres WITH SET TRUE;
-- existing ALTER FUNCTION OWNER, function ACL hardening and trigger creation
REVOKE project_hierarchy_checker FROM postgres;
```

The experiment performs these two insertions **only in the disposable migration copy**. It installs through the real CLI without making the migration role superuser, weakening RLS, granting the helper to API roles, or leaving SET/inherited helper privileges afterward. It verifies both `pg_has_role(...,'SET')` and `pg_has_role(...,'USAGE')` are false. PostgreSQL 17 retains an ADMIN-only creator membership granted by supabase_admin (`admin=true, inherit=false, set=false`), which is distinct from the temporary grant. The trusted CREATEROLE migration role already has administrative authority; ordinary API roles receive none.

Because #70 fails before a later migration could run, simply appending a correction after #71 cannot fix a fresh ordinary-CLI installation. Obtain explicit review of a controlled amendment/replacement plan for this **undeployed** migration; do not silently rewrite history. An independently approved privileged-runner alternative would need its own validation. This PR proposes the focused correction but does not edit the historical SQL.

### 2. Checked-in migrations omit task Realtime publication

The actual `supabase_realtime` publication was empty **before #70/#71**. Neither migration enrolls tasks. The app's existing `postgres_changes`, event `*`, table tasks, `user_id=eq.<id>` subscription could join a websocket but received a Realtime system error and no INSERT within the bounded observation window. This is a fresh-environment configuration gap, not evidence that #71 revoked a required Realtime function permission.

A disposable experiment issued `ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks`. Hot addition/rejoining still produced no task events within 12 seconds, despite subsequent system messages indicating PostgreSQL subscription success. After restarting only the owned Realtime container and using fresh authenticated clients, positive INSERT/UPDATE and channel resubscription were observed. The experiment changes both service lifecycle and client connection state; it does **not** isolate which one explains the hot-transition delay or prove hot publication changes never converge.

**Proposal:** add a separately reviewed, additive tasks-publication migration and a staged activation/reconnection acceptance step. Do not infer that a publication change on an actively running hosted stack will immediately deliver events merely because subscribe status is SUBSCRIBED. No hosted Realtime restart/configuration action is authorized here.

### 3. App-filtered DELETE needs replica identity FULL on the tested services

With tasks published and default replica identity, authorized INSERT/UPDATE succeeded; an unfiltered subscriber received own DELETE with `old={id}`, while the actual app's `user_id` filter missed that DELETE. After `ALTER TABLE public.tasks REPLICA IDENTITY FULL` in the disposable database, filtered INSERT/UPDATE/DELETE and resubscription passed. This preserves hard-delete semantics and does not loosen RLS.

[Proposed publication/replica-identity SQL](proposals/task-realtime.sql) is intentionally a documentation artifact outside migrations/ and executable test discovery, and is **not automatically deployed or applied by the harness**. The equivalent statements were tested as labeled diagnostics. FULL increases WAL volume, particularly with large descriptions; assess expected load before deployment. It does not grant the client access to full foreign old rows.

### 4. DELETE IDs are visible to an unfiltered subscriber

The adversarial authenticated subscriber deliberately omitted the app's user_id filter. It could not receive the other account's INSERT/UPDATE titles or descriptions, but could receive the other account's DELETE primary key. Observed foreign DELETE old-row fields were only `id`, both before and after FULL. The app-filtered subscriber did not receive foreign DELETE IDs in the final experiments.

This is a real service-level metadata exposure, not an authorization guarantee supplied by the Angular filter. A client can remove that filter. No test observed foreign title/description disclosure, but this does not meet a requirement that **all** task metadata, including deletion UUIDs, remain tenant-private. Review that requirement explicitly before deployment. If UUID deletion metadata is unacceptable, publication/FULL alone is insufficient; a separate authorized deletion-notification design is needed. Do not “fix” it by disabling RLS, granting extra access or changing deletion semantics in this verification PR. Supabase documents [Postgres Changes and DELETE/RLS limitations](https://supabase.com/docs/guides/realtime/postgres-changes); behavior here is additionally supported by recorded real payload-field assertions.

### 5. SDK immediate rejoin timing

An immediate subscribe after removing the last channel timed out during early harness runs. The installed SDK's removeChannel resolves after unsubscribe but starts an asynchronous WebSocket close; connect skips while `isDisconnecting()` is true. The harness now polls that public lifecycle state before starting another join and waits for a postgres_changes system response as well as the channel join. This is not an arbitrary sleep or a custom production reconnect policy.

This observation concerns SDK/client sequencing and predates any app change here; it was not reproduced as a full Angular account-switch UI defect. Treat it as a focused follow-up risk rather than silently refactoring TasksStore's Realtime lifecycle.

## Conditional compatibility results

See [ownership/publication/FULL experiment results](local-supabase-services-ownership-experiment-results.json). These successes require the experiments described above:

| Requirement | Result |
| --- | --- |
| Real Auth signup, password login and session refresh | Passed before migration and after conditional installation. |
| Logout, anonymous fallback, refresh-token revocation and subsequent login | Passed through GoTrue; no claim that an already-issued access JWT is immediately invalidated. |
| Task create/read/content update/completion/order/schedule/assignment/delete | Passed with the installed Supabase JS client and the same payload/RETURNING/filter contracts used by TasksStore. Timestamp trigger still executes without caller EXECUTE. |
| Project create/read/rename/reparent/root | Passed; generated UUID defaults work without sequences. |
| Invalid self/descendant ancestry, cross-account parent reference | Database rejection through PostgREST (`23514` / `23503`). |
| Two-account RLS, forged ownership, anonymous table operations | Denied or zero visible/modified rows as appropriate. Private helper schema is not exposed by the API. |
| Authenticated direct project DELETE | Denied, including own project. |
| delete_project RPC | Owner success; foreign and anonymous callers denied. Direct tasks move to Inbox, immediate child promotes to root, grandchild and its task retain their relationship. |
| Future function default EXECUTE | A new postgres-owned public function without explicit grant is not executable; explicit authenticated grant works, anon remains denied. |
| PostgREST cache / existing sessions | Existing access tokens continue CRUD immediately after ordered CLI migrations; explicit NOTIFY schema reload makes a new granted RPC callable without restarting PostgREST. |
| Realtime INSERT/UPDATE/DELETE and resubscription | Passed with publication, owned-service restart/fresh clients, and FULL. Not passed for the checked-in fresh-install state. |
| Foreign task content | No foreign INSERT/UPDATE title/description or foreign DELETE title/description observed; unfiltered deletion-ID exposure remains as above. |

The integration tests exercise real SDK/API persistence contracts; they do not instantiate TasksStore or launch the Angular browser UI against this stack. Existing Angular tests remain the application/state/queue/rollback coverage. Browser UX, real token expiry over an hour, hosted networking, external Auth providers, Storage, GraphQL and hosted service upgrades were not verified.

No extra EXECUTE grants were needed for existing Auth/RLS/timestamp/RPC/Realtime dependencies in the successful experiments. Existing Auth/Realtime functions were created by platform initialization/owners; postgres future defaults do not retroactively revoke those ACLs. This is not evidence that every future platform migration will remain compatible. Future postgres-owned callable functions require explicit intended-role grants; test platform upgrades/creator-specific defaults separately.

## Other verification and artifacts

- [Retained concurrency/ACL results from this assignment](local-supabase-concurrency-results.json): 28 baseline + 30 corrected-ACL check groups passed. Includes independent-connection two/three-project races at all three isolation levels, existing/lazy guard rows, rollback, deletion races and privilege denials. This harness remains intact and runs on its isolated PostgreSQL 17.6 fixture; it was not replaced by sequential HTTP tests or rerun as that fixture against the real 17.11 Auth database.
- Full Angular suite: **354 tests, 24 files passed**.
- Production build: passed; existing TaskRow 7.62 kB and sidebar 4.31 kB component-style warnings remain, no budget error.
- Diff whitespace check: passed before commit.
- Production code, checked-in migrations, RLS policies and actual application's local environment credentials: unchanged.

The scripts use bounded polling for actual service/subscription state. A successful websocket join alone is insufficient. During development, test-only assertions were corrected to distinguish ADMIN membership from SET/USAGE and to permit an account's own old description in FULL UPDATE events while still rejecting foreign descriptions. Those were harness corrections, not weakened tenant-boundary checks.

## Required next review before any hosted deployment

1. Approve and independently review the unreleased #70 ownership-installation correction; verify no SET/inherited helper rights remain and no application-role membership is added.
2. Review an additive publication/FULL migration, WAL costs, and whether foreign deletion UUID exposure is acceptable. If not, stop and design the required authorization-aware transport separately.
3. Repeat the installation and the positive API/Realtime matrix on the corrected release candidate in a new disposable stack, including cold startup and active-client transition/reconnect acceptance. Current checked-in history still fails the installation gate.
4. Independently inventory hosted role ownership/membership, effective/default grants, grant automation, publication and replica identity only when separately authorized. Local 17.11 behavior does not establish hosted configuration/version or existing data validity.
5. Only then request a separately reviewed deployment plan with backups/recovery, bounded locks, cycle preflight and explicit hosted approval. This report grants none.

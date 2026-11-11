# Private task Broadcast migration verification

## Scope and installation

PR #74 was already merged at main `6d32cb2` before creating `codex/private-task-broadcast-migration`. That change promoted its experiment into the additive migration `20261109060000_add_private_task_broadcast.sql`. Earlier migration files, frontend code, TasksStore and the independent PostgreSQL harness are unchanged. **Hosted deployment remains blocked and unauthorized.** Database rehearsals use disposable environments.

## Native function grant correction

The hosted operator reports that `postgres` has EXECUTE on `realtime.send(jsonb,text,text,boolean)` without grant option or membership in its owner role, and that PUBLIC has EXECUTE. The revised, still-undeployed migration relies on effective sender EXECUTE and leaves the managed function ACL untouched. It checks both schema USAGE privileges and all six INSERT column privileges after issuing the existing grants. A missing privilege raises an exception inside the installation transaction. No sender privileges were added.

- Previous SHA-256 from the historical Windows rehearsal (CRLF): `c097f5794abae14b5a93e355639c30e62de1b798120f1a521676936e6273efe7`. The previous Git LF digest is `baab85038b92455ad4e0741b6e32d2b3044a92ab915cdf6becfcee9268419ab5`.
- Revised SHA-256 for the rehearsed Windows checkout (CRLF): `5168a90d00978c67e6eba25927ec40ccddbcf5645bd3f401145c39b13ed7dfec`. The Git-normalized LF digest is `7817aff0ee0490b986da830bc79ef695a12ca2154432c031cc362370b2d06e88`.
- `python scripts/test-broadcast-grant-authority.py` passed five checks in disposable PostgreSQL 17.6. The old GRANT warned under the reported authority. The revised sender setup succeeded with PUBLIC EXECUTE and no direct function grant. Missing EXECUTE, missing schema USAGE grant authority, and a missing grant option on one INSERT column each aborted and rolled back role and schema creation. This fixture executes the exact sender setup against synthetic ACLs.
- `node scripts/test-private-broadcast-proof.mjs --report-file tmp/broadcast-grant-review/native-proof.json` passed all 34 groups against a fresh local Supabase stack (CLI 2.120.0, PostgreSQL 17.11, Realtime v2.140.10), including unchanged-file installation, owner delivery, cross-account denial, partition access denial, and send-failure recovery.

Supabase's managed Realtime schema restrictions preserve supported RLS policy customization. The remaining lock and grant operations still require hosted migration-role compatibility. The native function's hosted signature and ACL cannot establish the hosted service's authorization-probe behavior. Reconfirm the managed privileges and runtime compatibility before activation. Any environment that already recorded the previous migration version needs separate review because its migration ledger will not automatically replay this amendment. [Supabase managed Realtime schema changelog](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)

## Release package verification

The two revised digests differ exclusively because of line endings. Choose the byte representation during packaging and record its approved SHA-256 in the release manifest. Hash the final SQL file in the isolated CLI workdir with `Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256` and require an exact match to that manifest before the dry run and again before applying. Copy bytes unchanged and keep the same verified package between steps. A digest from Git or another checkout is insufficient evidence about the packaged file. Stop on a mismatch and review the package before proceeding.

## Migration behavior

The migration adds:

- A `task_notification_sender` NOLOGIN, NOINHERIT, NOBYPASSRLS role with only schema usage, native send execution and six message-column INSERT privileges. It cannot read tasks or messages.
- A private schema and VOLATILE SECURITY DEFINER trigger function with empty search_path and row_security enabled. Temporary SET membership and schema CREATE authority support ownership transfer; both are revoked before COMMIT. API roles cannot assume the helper role or execute its function.
- An AFTER ROW task trigger covering INSERT, UPDATE and DELETE, including updates from delete_project. Topics derive exclusively from OLD/NEW ownership; trusted ownership transfer notifies both owners.
- Owner-only private receive policies, an exact sender event/payload policy, and restrictive denial of client INSERTs on the reserved topic prefix. No client publishing policy is added.

The payload is `{v:1}` plus the native sender's independent message UUID. It contains no task/deletion identifiers or content. Native send failure and the trigger's scoped exception handlers permit task persistence without successful notification. Warnings contain SQLSTATE rather than task data. PostgreSQL cancellation/fatal error semantics are not overridden.

Installation is transactional, with a five-second lock timeout and thirty-second statement timeout. It locks tasks/messages and aborts on preexisting message policies, any raw tasks publication, unexpected native function signatures/security or messages ownership/RLS, unsafe API privileges, direct partition grants, and database-visible private-schema Data API exposure. Unknown objects are not removed. Role/schema name collisions also abort atomically. Installation does not publish tasks or change replica identity.

Database catalogs cannot reveal all external PostgREST environment configuration. Deployment additionally requires auditing gateway-exposed schemas, enabled APIs, platform function definitions and future partition grants. A signature/owner check is not a cryptographic verification of platform code. Existing raw task publications require a separately reviewed cutover; this migration refuses to silently remove them.

## Native authorization-probe compatibility

The first real integration run reproduced a compatibility failure: requiring private=true on every SELECT denied the owner's private channel join. The native Realtime v2.140.10 authorization routine creates payload-free probe rows without a private flag, reads them in the same transaction under the user's claims, then rolls back. See the pinned [authorization implementation](https://github.com/supabase/realtime/blob/v2.140.10/lib/realtime/tenants/authorization.ex) and [message model](https://github.com/supabase/realtime/blob/v2.140.10/lib/realtime/api/message.ex).

Normal message reads still require private=true. A separate compatibility policy admits only private=false broadcast rows with null payload, binary payload and event, matching both the authenticated owner and requested topic, whose xmin equals the current assigned transaction ID. This supports the rolled-back native probe without changing the platform's private-column default or admitting committed public payloads. It does not grant INSERT. Committed probe markers and same-transaction payload-bearing public rows are explicitly tested as unreadable. The original failed run is retained in `private-task-broadcast-private-read-reproduction.json`.

This is a deliberate, narrow exception to a blanket private=true rule, tied to the tested native protocol. Service upgrades must revalidate it. Recommend independent security/database review before deployment, particularly this policy and platform partition behavior.

## Executable verification

Commands (from repository root):

```text
node scripts/test-private-broadcast-proof.mjs
node scripts/test-local-supabase-services.mjs --installation-only --full-chain-start
python scripts/test-database-privileges.py
pnpm exec ng test --watch=false
pnpm exec ng build --configuration production
node --check scripts/test-private-broadcast-proof.mjs
node --check scripts/test-local-supabase-services.mjs
git diff --check
```

The Broadcast runner copies actual migration bytes unchanged and applies them with the real local CLI. A known disposable deny policy first causes installation to abort: the policy survives, no sender is created, and no migration version is recorded. Only that test-owned policy is removed before retrying. The independent fresh-chain gate starts a new environment with the entire checked-in chain present.

The separate fresh-chain installation/API gate passed **13 check groups**, including byte-identical migration copies and recorded versions, real Auth, task operations, project cycles, RLS, delete_project, explicit future-function execution grants and schema-cache reload. Its result is archived as `private-task-broadcast-fresh-installation-results.json`. Both disposable Supabase stacks were stopped and their volumes removed; the preexisting application stack was left running. Syntax and diff checks passed.

The suite uses actual GoTrue users, authenticated Data API/RPC operations and adversarial websocket clients. It covers A/B delivery; foreign, guessed and anonymous private joins; public twins; raw task/message feeds; REST/websocket/SQL forgery; owner GUC spoofing; partition access; token refresh/account switch; task INSERT/UPDATE/DELETE; Markdown/title/completion/scheduling/order/project updates; delete_project; trusted transfer; rollback; three-row and twenty-five-row transactions; malformed sender payloads; and missing sender permissions. SQL publishing attempts commit, so rollback cannot disguise a successful forgery. Positive-control fences establish that quiet adversarial observers are not merely disconnected.

The actual-migration Broadcast suite passed **34 check groups** on CLI 2.120.0, PostgreSQL 17.11, Realtime v2.140.10, GoTrue v2.197.0 and PostgREST v16.4. Results are recorded separately in `private-task-broadcast-migration-results.json` and `private-task-broadcast-concurrency-results.json`; historical #74 and privilege reports remain unchanged. The independent PG17.6 suite passed **28 baseline + 30 candidate privilege/concurrency groups**. The full Angular suite passed **354 tests in 24 files**. Production build passed, with existing component warning sizes of TaskRow **7.62 kB** and sidebar **4.31 kB**, and no budget errors. No new frontend tests are needed because frontend behavior is unchanged.

An extra EXECUTE-revocation experiment was not accepted as evidence: the local migration role cannot revoke the platform owner's PUBLIC grant or SET ROLE to that owner. The checked-in fault test instead revokes the sender's actual INSERT privileges, verifies no message is stored, verifies task persistence through the API, restores the grant, and confirms subsequent positive delivery. It does not claim to test every outer exception-handler failure mode.

## Operational and privacy limits

Positive websocket delivery tests require active subscribed clients and platform-maintained message partitions. The migration neither creates daily partitions nor guarantees their future availability. A successful channel join does not prove a notification was persisted or delivered. Missing permissions/partitions, service outages or disconnection may lose invalidations; a subsequent authenticated Data API read remains authoritative. Broadcast history is not an application replay log.

Each changed task emits one message, or two for an owner transfer. The twenty-five-row experiment verifies twenty-five notifications, not production throughput, latency, billing or a safe bulk-size ceiling. Expect message/WAL/storage work proportional to changed rows and fan-out to subscribed clients; no batching framework or new retention table is added. Native retention and replication costs remain platform-dependent.

Private topic authorization prevents the tested ordinary foreign accounts from receiving even deletion identifiers. Public client-created messages are a separate namespace and are not trusted task notifications. A saved, still-valid A JWT remains A-authorized until expiration; logout is not immediate server revocation. GraphQL-enabled deployments were not tested because GraphQL is disabled in this disposable configuration. Privileged database/platform administrators remain trusted.

Production Angular remains in API-only mode following the completed raw-publication cutover. The later client implementation supports private Broadcast with paginated authoritative reads, coalesced invalidation, reconnect catch-up and session guards. Hosted migration and frontend activation remain separate release decisions. See the [cutover record](task-publication-cutover.md) and [client verification](tasks-broadcast-invalidation-sync.md).

## Rollback and recovery

Installation failure rolls back all added objects/privileges. After an authorized deployment, reversal needs a separately reviewed transaction removing only this migration's trigger, function, policies, schema and role after checking dependencies and concurrent use. Do not use broad CASCADE, rewrite applied migration history, restore leaked raw DELETE feeds or modify existing project/task RLS. Disabling notifications requires an authoritative read/recovery plan for clients. Previously applied disposable copies should be recreated or explicitly reconciled rather than treated as an automatically upgradeable release.

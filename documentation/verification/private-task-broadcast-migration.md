# Private task Broadcast migration verification

## Scope and installation

PR #74 was already merged at main `6d32cb2` before creating `codex/private-task-broadcast-migration`. This change promotes its experiment into the additive migration `20261109060000_add_private_task_broadcast.sql`. Earlier migration files, frontend code, TasksStore and the independent PostgreSQL harness are unchanged. **Hosted deployment remains blocked and unauthorized.** All database verification uses disposable loopback-only environments, never the existing application's local database or hosted credentials.

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

The current Angular client still uses its earlier synchronization path. This server-only PR does not make it Broadcast-aware or fix reconnect/pagination. Before deployment, the next client phase must implement complete paginated authoritative reads, coalesced invalidation, reconnect catch-up and session guards. No hosted privacy or compatibility guarantee is claimed from local testing.

## Rollback and recovery

Installation failure rolls back all added objects/privileges. After an authorized deployment, reversal needs a separately reviewed transaction removing only this migration's trigger, function, policies, schema and role after checking dependencies and concurrent use. Do not use broad CASCADE, rewrite applied migration history, restore leaked raw DELETE feeds or modify existing project/task RLS. Disabling notifications requires an authoritative read/recovery plan for clients. Previously applied disposable copies should be recreated or explicitly reconciled rather than treated as an automatically upgradeable release.

# R2 Stage 1 — private Broadcast security and feasibility proof

## Recommendation and scope

**Proceed to review of the next focused phase.** The server-side model passed the tested local privacy and notification cases. There is no demonstrated cross-account task-content, task-ID, deletion-ID or private-activity disclosure in this configuration. This is not approval to deploy, not an Angular synchronization implementation and not a guarantee of durable notification delivery.

Branch: `codex/private-broadcast-security-proof`, based on main `f3ea16e` after PR #73. The approved R2 recommendation was supplied in the conversation; no separate private-Broadcast design document was found in the repository. Existing dated project-context documents were read as background, with current code and verification reports authoritative.

Only test infrastructure, disposable experiment SQL and documentation change. TasksStore, production Angular code, production migrations, application credentials and hosted systems are untouched. The existing application local stack was not reset, migrated or stopped. Hosted deployment remains blocked and unauthorized.

Artifacts:

- [Disposable experiment SQL](../../scripts/experiments/private-task-broadcast.sql), outside migration discovery.
- [Executable local proof](../../scripts/test-private-broadcast-proof.mjs).
- [Catalog audit, positive/adversarial results and observations](private-broadcast-proof-results.json).
- [This assignment's independent concurrency/ACL results](private-broadcast-concurrency-results.json).
- [Existing full-chain installation/API regression result](private-broadcast-installation-results.json).

## Notification and authorization model

An AFTER ROW INSERT/UPDATE/DELETE trigger calls a private, hardened function. It derives the destination from NEW.user_id, or OLD.user_id for DELETE. A trusted ownership transfer notifies both owners: the former owner must invalidate a row that left their account, without learning the new owner. No client-supplied topic, operation arguments or task JSON is accepted by the trigger function.

The event is `tasks_changed_v1`; the application payload is only `{"v":1}`. The tested `realtime.send` adds its own independent random message UUID, so the actual payload is:

```json
{"v":1,"id":"<independent broadcast-message UUID>"}
```

That ID is not the task's ID, not a deletion identifier, and is not stable across task operations. The application fields remain constant/versioned, but native wire payloads are **not byte-for-byte constant**. Tests assert the exact payload keys, version, UUID format and separation from known task IDs; no title, description, task row or operation is broadcast. The destination contains only the authenticated owner's account UUID. An owner can observe their own activity frequency; other accounts cannot subscribe to that private activity stream.

The SELECT policy on realtime.messages requires all of:

- authenticated role;
- broadcast extension;
- stored message topic equals `task-invalidation:` plus trusted auth.uid();
- requested realtime.topic() equals that same owner topic.

Both the stored row and requested topic are checked. Guessing a topic or setting a different topic GUC while retaining Account A's identity does not authorize B's rows. `private=true` on sends and private channels on clients preserve namespace separation; topic names and client filters are not security boundaries. No authenticated/anonymous INSERT policy is granted.

The helper is SECURITY DEFINER with empty search_path and row_security=on. It restores the prior transaction-local realtime.topic setting after calling the platform function. No task SELECT or ownership of application/platform tables is needed.

## Why one dedicated sender role/function is necessary

The actual catalog shows `realtime.send(jsonb,text,text,boolean)` and `broadcast_changes` are **SECURITY INVOKER**, PUBLIC-executable functions in this service version. An authenticated invoker's committed send attempt produced no message with the fresh default-deny policy set. Adding client INSERT authorization would allow client publishing, contradicting the desired server-only notification path.

The proof therefore uses one dedicated NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB role, `task_notification_sender_proof`, owning one private trigger function. It receives only:

- USAGE on the private helper and realtime schemas;
- EXECUTE on the exact platform send signature;
- INSERT on the messages columns required by that function;
- a role-specific INSERT policy requiring broadcast/private/versioned notifications in the reserved topic prefix.

It has no task SELECT, no messages SELECT, and no new table, durable application event log or framework. Function EXECUTE and helper-schema access are denied to API roles. The trusted migration role uses the PR #73 temporary-membership transfer pattern and revokes it before COMMIT. Effective SET/inherited sender rights are absent for postgres, anon, authenticated and service_role after installation. The dedicated role is justified by the failed invoker experiment, not added as a precaution without evidence.

The helper's permanent authority can produce only notifications; database/platform administrators and service credentials remain trusted. This is not protection against a database owner replacing the function or changing policies.

## Privilege and alternate-path audit

The JSON captures pre-install policies, parent/partition ACLs and RLS state, default privileges, all public/realtime callable function signatures/owners/EXECUTE rights, the relevant platform function bodies, exposed schemas and publications. The proof refuses to adopt existing messages policies or a raw tasks publication. It does not drop unknown policies or repair permissions silently.

| Path | Actual observation |
| --- | --- |
| Private A/B channels | Each owner joined and received only the intended notifications. Cross-owner, guessed and anonymous private joins returned explicit authorization errors; timeouts were not accepted as denials. |
| Same-name public channel | Public spoof had a positive public delivery control, but no database private notifications crossed namespaces. |
| Private REST send | Requests could return `{success:true}` even with no authorized delivery. No private event or committed message resulted; stream fences and payload checks, not HTTP acceptance, establish this result. |
| Private websocket send | Returned `error`; no forged private notification was delivered. |
| Direct SQL realtime.send | PUBLIC EXECUTE did not bypass INSERT RLS. Committed role-scoped forgery attempts created no message. The platform function warns rather than propagating send errors. |
| Direct messages INSERT | Authenticated insertion failed RLS. |
| Direct messages read / forged topic | A role-scoped A query using B's requested topic saw zero rows. A correctly scoped A query saw A's own minimal rows as a positive RLS control. Anonymous reads saw none. |
| Direct partitions | Existing daily partitions had no API-role read grants; authenticated SELECT attempts were denied, despite partition RLS being off. Future partition/upgrade grants require review. |
| Data API schema | realtime is not exposed; actual messages SELECT/INSERT requests failed. No generic SQL or exposed send RPC exists in the application's public function inventory. |
| GraphQL gateway | Returned HTTP 200 with `pg_graphql extension is not enabled.` No enabled GraphQL behavior was claimed or tested. |
| Unfiltered raw tasks/messages subscriptions | Channel joins were not mistaken for delivery. System errors reported unusable publication parameters; no events or deletion identifiers arrived while real task mutations/deletions and private controls succeeded. |
| Application schema CREATE | Authenticated CREATE permission is absent, so clients cannot install an exposed SQL wrapper. The existing public delete_project RPC checks ownership. |

SQL-role tests set the **correct** authenticated subject through a trusted test connection and vary the requested topic; they do not simulate forged server-verified identity. Intended-owner SQL visibility is necessary for Realtime SELECT authorization, not a promise that the authenticated role can never read its own minimal message rows. Browser clients have no arbitrary SQL/GUC-setting endpoint here.

An existing platform finding is also retained in the audit: realtime.subscription has API-role SELECT grants and no RLS, but is outside the exposed Data API schemas. This proof does not rewrite platform permissions or establish that table is safe under arbitrary future exposure. Broadening schema/API exposure, adding SQL wrappers or enabling GraphQL requires a new effective-access review. The task feed does not use that table as a client data source.

## Actual integration cases

**30 check groups passed** against real local Supabase Auth, PostgreSQL and Realtime. The result file includes the exact environment and observation counts.

- INSERT for A and B; title/Markdown, completion, scheduling/order and assignment UPDATE; owner DELETE; foreign DELETE observed only on its owner's private channel.
- Existing delete_project RPC generated the task-to-Inbox UPDATE notification and preserved that task.
- Explicit rollback and an error after an earlier successful INSERT produced no committed notification. Later positive controls on both topic streams checked for spurious delivery.
- Three changes in one transaction produced three notifications; a 25-task bulk INSERT produced 25.
- Trusted ownership transfer produced one notification to each owner, without identifying the task or the other owner.
- Cross-owner/anonymous/guessed joins, public twins, raw subscriptions, REST/websocket/SQL forgery, parent/partition row access and Data API bypass attempts were exercised.
- Token refresh retained correct A access. Sending a new B token invalidated the old A channel, and B then joined/received B events.
- A separately retained, still-valid A access JWT could join A after logout. Logout does not instantly invalidate an already-issued JWT in this model. No claim of immediate global access-token revocation is made.
- A disconnected receiver read its missed task through the Data API and received a subsequent notification after rejoining. The default subscription did not act as a durable replay log.
- Revoking sender INSERT temporarily caused a task update to commit **without** a stored or delivered signal. Restoring the grant restored notifications. This confirms the need for authoritative catch-up.

Negative checks use explicit denials, committed message counts, later positive-control fences and end-of-run payload/event assertions. They are finite local observations, not a universal proof about future service versions or arbitrary network schedules. No unauthorized event counts or canary content were observed.

## Delivery guarantees, security limits and costs

The platform send function catches errors and raises WarnSendingBroadcastMessage warnings. That permits successful task persistence with a lost notification; it is not an outbox. Successful notifications are transactional message inserts: a later transaction rollback also rolls back the message. Live receipt is not guaranteed, ordered replay is not assumed, and exactly-once behavior is not promised. Supabase documents database-broadcast storage/partition behavior separately from application state; none of it replaces a fresh RLS read. [Broadcast documentation](https://supabase.com/docs/guides/realtime/broadcast)

Private authorization is cached per connection and reconsidered on relevant token/connection changes. The refresh/switch tests passed, but valid old credentials remain valid within the JWT window. If the product requires immediate revocation of all retained JWTs on logout, this proof does not satisfy that additional requirement and an Auth/session design would be needed. [Authorization documentation](https://supabase.com/docs/guides/realtime/authorization)

The 25-row statement completed with its 25 observed notifications in **667 ms** in the final local run. This is a Docker observation, not production capacity evidence. Per-row notifications are a reasonable initial proof/limited-beta design, conditional on measuring actual workload. An ownership transfer doubles sends; a project deletion moving N tasks emits N notifications. Client coalescing can reduce fetches but not broadcast sends.

Expected overhead is one messages INSERT, index/RLS work and WAL per normal affected row, plus topic authorization at joins. Message storage uses existing platform partitions/retention, not a new application table. No tasks publication or REPLICA IDENTITY FULL is needed; both remained unchanged. Native Broadcast still has storage/WAL overhead.

For W row notifications and K receiving clients, budget approximately W sends plus W*K receptions, along with peak connections and later Data API reads. Current message billing counts sends and receiving subscribers; price/quotas must be checked when planning deployment. [Message accounting](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)

## Reproduction and other verification

From the repository root:

```powershell
node scripts/test-private-broadcast-proof.mjs
node scripts/test-local-supabase-services.mjs --installation-only --full-chain-start
python scripts/test-database-privileges.py
pnpm exec ng test --watch=false
pnpm exec ng build --configuration production
node --check scripts/test-private-broadcast-proof.mjs
node --check scripts/test-local-supabase-services.mjs
git diff --check
```

The proof imports the existing manifest/loopback/CLI helpers without running the old suite on import. Their direct-entry guard preserves standalone use. A unique disposable project under ignored tmp/ uses 563xx ports, no seed data or hosted/application credentials. Only actual checked-in migrations are copied; the experiment is read explicitly from scripts/experiments. API keys/access tokens remain in memory. All owned proof stacks/volumes were removed after testing; the preexisting life-is-too-short stack remained running. Optional audit-only/keep-stack flags are diagnostic only and retain no right to adopt another database.

Versions: CLI 2.120.0, PostgreSQL 17.11, GoTrue v2.197.0, PostgREST v16.4, Realtime v2.140.10, Node 22.16.0. The primary proof passed with no blocking findings in its tested configuration. GraphQL-enabled integration, service upgrades and hosted policies/grants remain unverified.

The independent PostgreSQL harness remains unchanged: **28 baseline + 30 restricted-ACL/concurrency groups passed** in its isolated PostgreSQL 17.6 fixture. The existing standalone fresh-chain installation/API gate passed. Full Angular suite: **354 tests in 24 files passed**. Production build passed with existing TaskRow 7.62 kB/sidebar 4.31 kB warnings, no budget errors. Syntax and whitespace checks passed before commit. No production frontend tests were added because frontend behavior is unchanged.

During harness development, two assumptions were corrected rather than weakening security checks: one SDK client reuses a topic's existing public/private channel, so public/anonymous-private attempts need distinct clients; and send acknowledgements do not establish delivery. The final proof also commits SQL send attempts so transaction rollback cannot make an unauthorized successful send look denied.

## Proposed production migration outline — not installed

After independent review, a next-phase additive migration could:

1. Audit effective Realtime policies, grants, public functions, enabled APIs and all raw Realtime task feeds. Stop on unknown broad policies or incompatible publication configurations; do not silently replace them.
2. Create one private server-only sender role/function with the tested minimal rights, empty search_path, row_security=on and controlled temporary ownership membership.
3. Add narrowly scoped owner-topic SELECT authorization and server-only INSERT authorization on realtime.messages; leave API roles without a publishing policy.
4. Install the task AFTER trigger using trusted OLD/NEW ownership and the versioned minimal payload, including both owners on trusted transfer.
5. Ensure tasks are absent from every client-accessible raw feed without breaking unrelated replication. This proof verified absence; it did not test removal/hot cutover from a populated publication. Do not enable FULL as a workaround.
6. Revoke temporary membership before COMMIT, verify effective privileges, and run this proof plus API/concurrency checks against the actual release candidate.

No production migration is added here. Before rollout, Stage 2 still needs the TasksStore invalidation/coalescing/catch-up design, complete snapshots beyond the existing 1,000-row limit, old-account guards and bounded reconnect/error handling. Existing clients need a safe cutover plan. Rollback should preserve RLS-protected reads and eventual polling/manual recovery rather than re-enable raw DELETE leakage.

No privacy blocker was reproduced for ordinary valid A/B/anonymous credentials in this local model. Production deployment nevertheless remains blocked: enabled GraphQL and actual target grants/policies require verification, notification loss needs client recovery, JWT revocation limits must be accepted, and a migration/rollout needs separate authorization. Recommend independent database/security review before any production implementation or deployment.

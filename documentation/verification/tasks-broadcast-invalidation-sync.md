# Stage 2C — task invalidation consumption

> November 10 rollout update: #70/#71 are deployed and verified per operator; #75 is not deployed. The [API-only bridge](api-only-task-sync-bridge.md) now changes the effective production source setting to `api-only`, pending separate deployment approval. Development remains unchanged. References below to both tracked defaults being legacy describe the original Stage 2C result, not the bridge branch.

## Scope and rollout default

PR #76 was already merged at main `3f76071` before creating `codex/tasks-broadcast-invalidation-sync`. Reviewed AGENTS.md, the dated project context, private Broadcast migration/proof, pagination and F1/F2/F3/F4 verification against current code/tests. **No hosted access or database deployment occurred or is authorized.** No SQL migration, RLS, ownership, scheduling or project CRUD changed.

`TASK_SYNC_CONFIG` is one small injection token, not a runtime flag service. Its modes are:

| Mode | Subscription | Retrieval/recovery |
| --- | --- | --- |
| `postgres-changes` (checked-in default) | Existing account-filtered raw channel | Existing initial/manual reads, optimistic writes and raw event reconciliation |
| `broadcast` (explicit opt-in) | Private `task-invalidation:<auth user ID>`, `tasks_changed_v1` | Complete API snapshots, join/rejoin catch-up, coalesced hints, lifecycle recovery, bounded retry and safety reads |
| `api-only` (explicit recovery) | None | Initial/manual, visible/online safety and lifecycle reads through the same coordinator; deliberately slower/degraded synchronization |

Both tracked environment files remain explicitly `postgres-changes`. Locally ignored development overrides without a mode also default safely to it. **Current angular.json builds production from environment.ts; environment.prod.ts is not currently wired as a production replacement.** Do not edit only the latter and assume rollout changed. Development's existing file replacement is unchanged. No credentials or build routing changed.

Source merge/GitHub Pages deployment therefore preserves the existing production synchronization path against the undeployed database. There is no join-status-based auto-detection, silent switch, or automatic downgrade to raw events. The legacy path's previously documented publication/delivery limitations are not fixed by this compatibility default.

## State and coordination

The existing `realtimeConnected` signal records the SDK's last SUBSCRIBED status. It is **not** notification-delivery or synchronization proof. `lastSyncedAt` records the last successfully applied complete authoritative read with no protected-task deferral. `lastInvalidationAt` records a valid v=1 hint observed on the current private subscription. Neither timestamp promises a globally current database snapshot or durable delivery. No misleading fully-synchronized boolean is introduced.

Broadcast payload content/IDs never become task rows or mutation instructions. Only v=1 matters; the hint increments a local dirty generation. All task data still comes through PR #76's RLS-protected complete keyset pagination and unchanged revision-aware merge. An initial foreground read can show tasks promptly. Every successful join/rejoin requests a distinct authoritative catch-up, even if the initial read finished before joining. A join/hint while that read is active remains dirty and is serviced after it settles.

The coordinator is a private TasksStore lifecycle method, with session-local counters/timers rather than another service/store. Bursts use a 150 ms trailing debounce with a 1,000 ms maximum wait from the first unsatisfied scheduled hint. Availability, active foreground work, mutation deferral and failure backoff intentionally take precedence over that bound. One background snapshot is in flight at a time. It captures its dirty target; hints during any page remain newer and cause one subsequent snapshot, rather than disappearing when the first read finishes. A hundred duplicate/burst hints before the timer produce one background snapshot, not a hundred mutations or refreshes. Continuous activity across completed snapshots can still require multiple reads; no fixed global requests-per-second or deduplication-history guarantee is claimed.

Background reads do not acquire foreground loading or clear task-action errors. Explicit refresh retains its public Promise behavior and latest-request-wins semantics, and may supersede a background read. The latter cannot subsequently publish rows/error state. All pages remain atomic: a later-page failure leaves earlier visible data intact. Snapshot revisions cover the entire paginated request, preserving creation identities, pending changes, settled saves/rollbacks and deletion tombstones.

If a read protects pending or changed tasks, it does not claim a fully settled read timestamp. Its generation remains unsatisfied. Queue/creation settlement merely wakes the coordinator: it does not blindly fetch per mutation. Its own follow-up waits for pending operations to settle; a **newer hint** may still reconcile unrelated remote tasks while an older local save is hung. This avoids broadly blocking remote synchronization behind one pending task. Mutation persistence, queue ordering and single-task reconciliation remain intact.

## Failure, lifecycle and recovery

Synchronization failures have a separate `syncError`. The existing task-header alert/retry is reused, with page/action errors taking precedence, so two copies are not shown. A successful read clears snapshot-failure feedback, never an unrelated mutation error. Connection failure remains visible until a successful rejoin and catch-up; an API read alone does not repair the channel. Foreground failures continue using the original task-store error path. The last successful read can remain valid history through an error; it is not updated by join alone or failed/partial reads.

An authoritative background failure receives at most three additional retries at 1 s, 5 s and 15 s. After four failed attempts, further hints do not restart a busy loop. Online/resume/rejoin or the safety tick resets that bounded budget; manual Refresh task list remains available. A timeout/cancellation of an already-issued HTTP request is not implemented; a hung foreground request can delay catch-up until it settles. The SDK alone owns websocket reconnect/rejoin—there is no independent channel-retry loop. CHANNEL_ERROR/TIMED_OUT/CLOSED update connection feedback; each subsequent SUBSCRIBED requests catch-up for missed creates, updates and deletes.

`online`, `offline`, `pageshow` and document `visibilitychange` coordinate availability. Background work is paused offline/hidden and resumed with catch-up. A configurable **120-second visible/online safety interval** recovers missed hints even when the socket appears joined, including native-send failures. It is necessary because Broadcast is best effort and has no durable replay. It does not create partitions, repair database authorization, or prove the sender operational. Setting `safetyRefreshMs=0` explicitly disables this protection; do not do so for the API-only recovery mode unless manual/lifecycle-only behavior is intentional.

For a stable N-task account, each full read costs `ceil(N/500)+1` API requests (one empty request for N=0); lower server caps require more. An idle visible tab therefore makes roughly one such snapshot per two minutes in Broadcast/API-only mode, plus startup/catch-up, notifications, recovery and bounded retries. Background tabs/offline windows do not periodically fetch. Debounce reduces reads, not server message volume. This is an initial beta policy, not a capacity/billing benchmark or offline-first implementation.

Effect cleanup invalidates the session-local closure, clears timers/listeners and tears down the captured channel before a new account's lifecycle is initialized. Existing generation plus direct auth-ID/request checks reject late pages and callbacks. Delayed removal failures are intentionally ignored after teardown; they do not become another account's errors. Logout resets account-owned tasks, errors and timestamps. The real SDK direct A→B transition is also tested, not only a mocked delayed removal. Valid retained JWT lifetime limits from the server proof remain unchanged; frontend lifecycle guards are not authorization.

## Activation and rollback runbook — separate approval required

1. Keep the current `postgres-changes` build while database deployment remains unauthorized. Do not infer readiness from SUBSCRIBED.
2. Separately authorize/review hosted migration installation and the existing #70/#71/#75 prerequisites. Audit native versions, policies, effective grants, API exposure and partitions. The private migration aborts if raw tasks publication already exists; any cutover/removal needs its own reviewed plan, not an automatic client action.
3. Before client activation, prove actual owner A/B positive delivery, foreign/public denial, INSERT/UPDATE/DELETE and delete_project through authorized deployment validation. Confirm complete API reads and platform message partitions. No such hosted validation was performed here.
4. In a separately reviewed build, set the **actual build environment's** `taskSyncMode` to `broadcast`. Keep the safety interval enabled. Verify first-join catch-up, genuine notifications (`lastInvalidationAt`), account switching and API recovery. A read timestamp or socket join alone is insufficient proof.
5. If the client needs rollback after the private migration, set mode to **`api-only`** and rebuild/redeploy, retaining authoritative reads, session/queue protections and visible/online recovery. Changes may take up to the safety interval or foreground/manual refresh to appear on other clients. This deliberately degraded mode does not require raw task publication or weakening private policies. Do not restore a raw DELETE feed as an emergency workaround.
6. Switching back to `postgres-changes` is only a valid restoration of the old live path when the database still supports that independently reviewed path. It does not restore notifications after tasks have been unpublished. Reverting to a pre-this-PR build after private cutover would retain initial/manual reads and writes but lose this automatic recovery; it is not the recommended rollback.

Existing open tabs can run old bundles until reload. Plan that transition, notification overlap and temporary degraded recovery before hosted cutover. This PR does not authorize deployment, alter publication state, or guarantee old clients will become Broadcast-aware without reload.

## Verification and limits

Commands:

```text
pnpm exec ng test --watch=false --include=src/app/features/tasks/state/tasks.store.spec.ts --include=src/app/features/tasks/state/tasks-broadcast-sync.spec.ts
pnpm exec ng test --watch=false
pnpm exec ng build --configuration production
node scripts/test-tasks-sync-local.mjs
node --check scripts/test-tasks-sync-local.mjs
git diff --check
```

The new fake-timer/deferred-Promise tests cover initial-read/join ordering, paginated dirty generations, 100 duplicate hints, continuous debounce, later-page failure and bounded recovery, foreground/background ownership, mutation settlement without duplicate writes, remote updates during pending saves, missed create/update/delete on rejoin, channel statuses, offline/hidden/resume/safety behavior, delayed old-account callbacks/teardown and logout. Existing F1/F2/F3/F4 tests remain, plus an explicit assertion that the default still uses the old production channel. A component test verifies one existing alert/retry surface and task-action error priority. API-only mode is separately covered.

Results: **127 targeted tests passed** (100 legacy task-store, 13 Broadcast/recovery coordination, 14 project-store). **388 tests passed across 25 files** in the full suite, with the one opt-in live test intentionally skipped there. Production build passed with the existing TaskRow **7.62 kB** and sidebar **4.31 kB** stylesheet warnings and no budget errors. Syntax and diff checks passed. No existing regressions were removed.

The opt-in `tasks-sync.local.spec.ts` runs the **actual Angular TasksStore**, not a reimplementation. The local harness validates a new loopback-only manifest-owned stack and passes ephemeral local credentials through an environment variable; it never reads application/hosted credentials. It first verifies legacy initial reads and writes **before** the Broadcast migration, then applies unchanged checked-in migrations and verifies private Broadcast with a 1,005-task paginated initial collection, actual INSERT/UPDATE/DELETE hints and state, direct A→B Auth switching, logout, and API-only recovery. **All three mode runs passed** with CLI 2.120.0; see [recorded results](tasks-broadcast-sync-local-results.json). Legacy publication delivery is a known prior limitation and is not claimed as tested/fixed by that baseline compatibility case. The disposable stack/volumes were removed; the existing application stack was left running.

During verification, the local fixture's overly generic Supabase client type was corrected, and an exact channel-options assertion was narrowed to the required private flag because the SDK adds its own supported default options. Neither was a notification/authorization failure. Self-review additionally identified and fixed broad background blocking behind a pending save; a new-hint regression verifies that unrelated remote tasks still reconcile.

Normal full-suite runs intentionally skip that one opt-in live test; the harness runs it independently for each configured mode. Finite local observations do not establish arbitrary network schedules, service upgrades, hosted permissions or physical iOS/Safari suspension behavior. Fake browser lifecycle tests do not replace physical-device acceptance. No SQL, RLS or token revocation policy was changed. Independent review of session/race behavior and the previously documented private-probe policy remains recommended before any production deployment.

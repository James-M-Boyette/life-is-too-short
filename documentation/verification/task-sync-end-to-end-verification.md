# Stage 3 — private task synchronization verification

## Decision and scope

**Source review: ready. Hosted deployment: NO-GO pending separate authorization and the checklist below.** PR #77 was already merged at main `7364bb9` before branch `codex/task-sync-end-to-end-verification` was created. AGENTS.md, dated project context and PR #74–#77 reports were consulted; checked-in code and current main outrank historical status descriptions.

No hosted Supabase access, migration, configuration, credential or data change occurred. No synchronization-mode default, SQL migration, RLS, UI, authentication, mutation queue or schema was changed. Both tracked frontend defaults remain `postgres-changes`. The only production correction bounds background snapshot lifetime; the rest is isolated verification and reporting.

Artifacts:

- [Multi-device actual-store test](../../src/app/features/tasks/state/tasks-sync-e2e.local.spec.ts) and [disposable runner](../../scripts/test-task-sync-e2e.mjs).
- [Successful multi-device results and workload measurements](task-sync-e2e-results.json).
- [Preserved large-burst notification-gap reproduction](task-sync-bulk-notification-gap.json).
- [This run's unchanged server authorization proof](task-sync-e2e-authorization-results.json).
- [Existing Stage 2C rollout and recovery design](tasks-broadcast-invalidation-sync.md).

## Confirmed stalled-request defect and correction

A deferred request that never resolves kept the background coordinator's running flag true indefinitely. A new fake-timer regression failed against main: after 30 seconds there was no timeout/recovery feedback and the pending snapshot still owned coordination. The corrected test verifies subsequent reconciliation and rejection of a late obsolete response.

Each complete **background snapshot** now has a 30-second deadline, covering all its pages. An AbortController signal is passed to every Supabase page request. The coordinator races snapshot completion against cancellation, so it releases even if a transport ignores the signal entirely. Snapshot ownership includes `!signal.aborted`: an ignored or late response cannot merge earlier pages or update the current state. The race retains rejection handlers for late failures; they are not unhandled rejections.

Manual refresh cancels an obsolete background snapshot before starting the existing foreground operation. Account cleanup aborts current background work. Neither cancellation cancels task mutations or retries writes. Cancellation by a newer request does not consume that newer request's error/loading ownership or the old background retry budget. A timeout belonging to the current request produces actionable synchronization feedback and uses the existing bounded read retries. Deadline timers/listeners are removed on every completion path. Existing pagination, revisions, tombstones, optimistic identities, queues and rollback are unchanged.

Additional deterministic cases cover a never-settling later page, the same signal across pages, four never-settling attempts with safety reset disabled, manual takeover while the old transport remains pending, and account-switch abort. The existing tests cover later-page API/transport errors, offline/resume, missed notifications/rejoin, dirty generations, pending mutations, duplicate hints and obsolete callbacks.

The bound is logical coordination plus best-effort transport cancellation, not proof that PostgreSQL immediately stops a read. Native fetch honors the signal; a deliberately noncompliant transport can retain its old resource even though its result cannot apply. Foreground reads, writes and legacy single-task reconciliation retain their previous timeout behavior. A permanently pending foreground request can still postpone background work. Browser suspension can delay JS timers until resume. These are explicit remaining limits, not a generalized timeout framework.

## Actual multi-client integration

The disposable CLI stack installs the actual unchanged migration chain. Three legitimate Angular TasksStore instances use separate EnvironmentInjectors, HTTP clients, Auth sessions and websocket clients: A1 and A2 are separately authenticated sessions for the same account (different refresh tokens), while B is another account. They share the test process/document; these are independent SDK/state containers, not physical devices or separate browser processes.

An additional B-authenticated adversarial subscriber attempts A's private channel and receives an explicit authorization error. A separate unfiltered raw subscriber remains active through mutations. Positive owner delivery and authoritative state checks prevent interpreting a quiet/broken owner channel as evidence of authorization. The independent server proof also includes positive B delivery controls, anonymous/public twins, forging and alternate message access.

At the ordinary workload, both A devices converged through private hints and paginated API reads for:

- Stable optimistic INSERT identity and Markdown/content UPDATE.
- Completion, planned date and due date, preserving their distinction.
- Project reassignment and the existing delete_project RPC returning the task to Inbox.
- Task DELETE and 25 concurrent manual-position updates.
- An injected HTTP-only outage on A2, followed by online recovery.
- An unexpected close of A2's real underlying websocket. The SDK owned reconnect/rejoin; the store caught up a missed edit, then received and reconciled a subsequent edit.

B's store saw no A rows or private invalidation activity, and the adversarial raw observer saw no task/deletion events. A1/A2 were positive receiving controls. No unfiltered raw feed was enabled for testing. Node-only Docker fault operations validate a manifest-generated `lits-integration-<hex>` name and fixed loopback URL; they cannot target the application's named database. Only test fixtures are mutated.

## Important bulk-service finding

Earlier stress runs seeded 5,000 rows while both clients were connected, then required another change to converge promptly. One preserved run observed 5,000 hints per A client, a subsequent committed task and 5,001 stored notifications, yet neither joined client observed the new hint within 45 seconds. Another run missed a subsequent content/date update. These are notification-delivery gaps, not evidence of cross-account disclosure or lost database writes.

In the successful stress/safety run, the unmodified local Realtime log explicitly reported **`MessagePerSecondRateLimitReached: Too many messages per second`** during the large connected burst. No quota was raised or protection disabled. This confirms a service-limit condition in the stress workload; it does not establish the exact cause of every earlier gap or a universal 5,000-event threshold.

The final test separates ordinary operation checks from the large connected seed burst and records both outcomes. It does not turn a failed lossless-delivery assertion into an authorization success. Private Broadcast is explicitly best effort; subsequent authoritative convergence is the application guarantee being tested. The preserved reproduction remains visible for deployment review. **Do not promise prompt push convergence for large bursts or approve that operating point without target-limit/cost review.**

## Real lost-notification safety recovery

After workloads, clients were temporarily hidden, scheduled reads cancelled and in-flight reads allowed to settle. The fixture revoked only the dedicated sender's INSERT columns, performed one authorized task UPDATE, then restored exactly those grants in finally. The UPDATE persisted and the database notification count did not advance. Both stores retained the previous visible value.

Visibility was restored **without dispatching a resume event**. Both clients recovered the new value through their actual configured 120-second safety ticks, approximately **106,894 ms** after the write in this run. Each fetched **11 pages** for its 5,000 tasks. This was a real interval/condition observation, not an arbitrary sleep or a fake accelerated safety timer. The stored-message count establishes lost send; owner API/state assertions establish recovery independently of websocket status.

## Performance and cost observations

One controlled foreground snapshot per account size was measured while background reads were paused; A2 then caught up and both devices were checked. Bytes are **decoded JSON response-body bytes**, counted with response clones, not TLS/header/websocket bytes, compressed wire bytes or provider billing. Clone overhead is included in local timings. Fixtures have short titles and null descriptions, so real Markdown can increase sizes considerably. These are samples on local Docker/Node, not production latency or UI-render benchmarks.

| Tasks | Requests per complete snapshot | Decoded body bytes | Local elapsed | Safety GETs/client-hour | Safety decoded MB/client-hour |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 2 | 38,015 | 7 ms | 60 | 1.14 |
| 1,000 | 3 | 381,814 | 20 ms | 90 | 11.45 |
| 5,000 | 11 | 1,916,998 | 153 ms | 330 | 57.51 |

Hourly estimates assume a continuously visible/online client, the 120-second interval and no other reads. Two 5,000-task clients therefore imply about **115 MB/hour**, or roughly **920 MB over eight hours**, before hints, retries, startup and manual refresh. This is a decoded-volume model, not an egress invoice or quoted quota. Multiple tabs multiply the work; no cross-tab cache/coordinator exists.

At the 100-task operating point, 25 concurrent position writes converged in **263 ms** with **two GETs per A client** over the measured phase. A 100-hint repeated-version burst likewise required **two GETs per client** in its observation window. Those are snapshots through 100 rows, not 5,000-row bulk-render timings, and do not guarantee a global request-rate cap. Native sends still scale per changed row; debounce only reduces API reads. With two authorized receiving devices, W normal notifications imply roughly W sends and 2W receptions, plus connection/authorization and API work. The adversarial raw socket adds a connection but no private subscription rights.

**120-second assessment:** reasonable as an initial bounded safety policy for a small, explicitly budgeted beta with modest account sizes, but not an unconditional approval for 5,000-task users/multiple always-visible devices. The measured large-burst rate-limit condition and decoded volume require an inventory of expected tasks/tabs/active hours, target service limits, resource alerts and accepted fallback latency. No cache, batching service, event-stream rewrite or local quota increase was introduced to conceal those costs. Hidden/offline clients pause periodic reads and rely on foreground/resume recovery.

## Authorization proof retained and rerun

The unchanged private Broadcast proof passed **34 check groups** against a separate fresh local stack and the final migration chain. It verifies the narrowly scoped native transaction-local, payload-free authorization probe exception, committed/nonprivate message denial, owner-only joins, guessed/foreign/anonymous denial, REST/websocket/SQL forgery, public twins, direct partitions/Data API message access, raw task/message subscriptions, both-owner trusted transfer, rollback and malformed sender payloads. Positive A/B fences accompany negative observations.

The proof also verifies that a saved, still-valid A JWT can remain A-authorized after logout until expiry. That is distinct from application logout/switch guards, which prevent obsolete state, callbacks, errors and request results from applying. No claim of instant JWT revocation or isolation from privileged database/platform administrators is made. GraphQL-enabled configurations and hosted platform versions remain unverified. This task does not broaden schema exposure or change the probe policy.

## Verification commands and results

```text
node scripts/test-task-sync-e2e.mjs
node scripts/test-private-broadcast-proof.mjs
pnpm exec ng test --watch=false --include=src/app/features/tasks/state/tasks.store.spec.ts --include=src/app/features/tasks/state/tasks-broadcast-sync.spec.ts --include=src/app/features/projects/state/projects.store.spec.ts
pnpm exec ng test --watch=false
pnpm exec ng build --configuration production
node --check scripts/test-task-sync-e2e.mjs
node --check scripts/test-private-broadcast-proof.mjs
git diff --check
```

- Actual multi-device integration passed, including the real safety interval and 100/1,000/5,000 snapshots; detailed metrics are linked above.
- Server authorization proof: **34 groups passed**. Its historical report was restored unchanged; this task's copy is archived separately.
- Targeted tests: **130 passed** (100 existing/legacy task, 16 synchronization, 14 project).
- Full Angular suite: **391 passed**, two opt-in local tests skipped in that normal run. The new Stage 3 test and existing server proof were executed explicitly; the previous Stage 2C local runner was retained unchanged.
- Production build passed. Existing stylesheet warnings remain: TaskRow **7.62 kB**, sidebar **4.31 kB**, no budget errors.
- Syntax/diff checks passed. Disposable stacks/volumes were stopped/removed, and the preexisting application stack remained running.

Fixture issues corrected during development included browser-tsconfig Node typing and an Auth response union; no dependency or production framework was added. No meaningful regression was weakened. The earlier convergence failures and bulk service warning are preserved/reported rather than described as successful prompt delivery. Self-review covered deadline lifetime, ignored aborts, stale success/failure handlers, manual takeover, account cleanup, ownership, metric boundaries and unchanged rollout defaults.

## Explicit future hosted go/no-go checklist

All applicable items require evidence in a **separately authorized hosted-deployment review**. This PR does not check them off by inference:

- [ ] Written authorization to access/deploy the hosted database; verified migration versions/status and reviewed backup restoration/recovery plan.
- [ ] Independent review of helper ownership, least privileges, private-schema exposure, native function versions/partitions and the authorization-probe compatibility policy.
- [ ] Audit target publication/RLS/default grants and enabled APIs. Unknown existing policies/publications must stop installation; no casual raw feed re-enable/removal.
- [ ] Transactional migration/preflight/lock timeout plan, maintenance/cutover ordering and approved failure rollback. Apply no unreleased-file rewrite silently.
- [ ] Real target owner A/A-device/B and adversarial positive/negative delivery checks, including DELETE, delete_project and direct alternate access, performed only with approved fixtures.
- [ ] Establish realistic event/message/connection limits, task counts, active tabs/hours, API/egress budgets and alerts. Resolve or explicitly constrain the demonstrated bulk rate-limit operating point.
- [ ] Explicitly accept up-to-safety-interval fallback latency, 30-second background deadline and slow-device/large-account behavior; no promise of durable Broadcast replay.
- [ ] Physical iPhone/Safari/touch, background suspension/resume, offline/online, cached-build and real multi-browser/device acceptance. JS fake timers/Node clients do not replace it.
- [ ] GitHub Pages client rollout coordinated separately: keep legacy default until database readiness; verify the actual environment.ts build path, then separately approve Broadcast activation.
- [ ] Plan existing tabs/service caches and reload/mixed-version transition. Old raw clients do not become Broadcast-aware automatically.
- [ ] Rehearse **api-only** degraded rollback with safety reads after private-only cutover. A legacy raw-mode rollback cannot restore an unpublished feed; do not weaken raw DELETE privacy to make it work.
- [ ] Confirm observability of actual hints **and** successful authoritative reads, not just SUBSCRIBED; define outage response, support expectations and abort criteria.

Demonstrated local correctness is a prerequisite, not hosted authorization or broad beta readiness. Remaining technical limits include non-transactional multi-page snapshots, normal multi-client edit conflicts, unbounded foreground/mutation HTTP lifetimes, native service quotas, JWT validity windows, platform upgrades and browser suspension. No cross-account task-content/deletion-ID disclosure was observed in the tested configuration; that is not a universal security guarantee for unknown hosted settings.

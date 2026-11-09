# Complete task snapshot retrieval

## Reproduced defect and scope

Baseline: main `943f34b`, with PR #75 already merged before creating `codex/task-snapshot-pagination`. Hosted deployment remains blocked. No hosted credentials, data or configuration were accessed.

The original refresh performed one SELECT and reconciled it as a full account snapshot. A deterministic regression modeled the actual API limit: an account/database and visible collection containing 1,005 tasks returned only 1,000 on that SELECT. Five legitimate unchanged tasks disappeared locally. Before the correction, **80 existing task-store tests passed and this new regression failed**. The test asserts the lost collection and complete expected IDs, rather than merely asserting query calls.

This PR changes only task retrieval before the existing reconciliation. It does not switch Realtime subscriptions to Broadcast, alter migrations, add polling/reconnection, change mutations or introduce a repository/pagination framework.

## Retrieval and reconciliation

TasksStore now requests up to 500 rows per query using `select('*').order('id', {ascending:true}).limit(500)`, adding `gt('id', lastId)` for subsequent pages. The UUID primary key supplies a unique total order by itself; an additional tie-breaker is unnecessary. IDs are stable throughout normal application creation and mutation contracts. Mutable title, dates, manual positions, updated_at and presentation ordering are not cursor fields.

Keyset pagination avoids offset shifts: deleting a lower-ID row does not cause a later row to be skipped, and inserting a lower-ID row does not move an already-read row into the next page. Offset paging was rejected for those concurrent-mutation risks. Normal UI ordering remains the existing created_at-descending/ID sort and existing project/planning position behavior.

The checked-in API cap is 1,000. The 500-row request leaves headroom, but completion does **not** depend on the server honoring that size: every nonempty response advances the cursor, even if short. Only an empty page ends retrieval. This requires one request for an empty account, two for a small nonempty account, and `ceil(N / 500) + 1` for a stable account under the configured cap. An exact multiple also gets its terminal empty request. A smaller effective server cap produces more requests without truncation. No count query is needed, and a count from another transaction would not establish a consistent snapshot anyway.

Pages accumulate in a request-local array. Missing/non-array responses, non-string/empty IDs, repeated or non-increasing IDs (including changed duplicates), and mismatched ownership for the captured authenticated user reject the refresh before a full merge. API and transport failures also reject. Successful earlier pages are never published independently. Existing visible state, including legitimate optimistic changes, remains on failure; the existing store error and page Refresh task list action support retry.

Existing request identity, session generation and direct auth-ID guards are checked before each page and after each successful response. A superseded/session-obsolete success is discarded and starts no further pages. Its in-flight request is not remotely cancelled. Obsolete failures still reject their original caller, preserving PR #65's public Promise semantics, without owning current error/loading state. Only the latest current-session refresh may merge or clear refresh loading.

The revision snapshot is still captured **once before all pages**. The unmodified merge preserves pending tasks, confirmed mutations or rollbacks whose revisions advanced during retrieval, optimistic creations, and deletion tombstones—even when a stale row was collected on an earlier page. Creation identities, queues and deferred single-task reconciliation are unchanged. Supabase RLS remains the authorization boundary; client guards do not replace it.

## Consistency limits

This is complete pagination for a stable, authorized account, **not a database transaction spanning HTTP requests**. Each page sees its own database snapshot:

- An insertion ahead of the cursor may be included; an insertion behind it may wait until a subsequent refresh.
- A deletion ahead of the cursor is omitted without skipping neighbors. A row deleted after being collected can remain in this response unless an observed local/Realtime revision protects that deletion; a later refresh removes it.
- A remote edit to an already-read row can similarly wait for the existing Realtime path or another refresh. Normal app IDs do not change, but arbitrary trusted/external primary-key changes are not treated as immutable history.
- Continuous writes can produce a mixed-time result. No finite count query, offset scheme or ordinary series of SELECTs guarantees point-in-time consistency. A server snapshot/version protocol would be a different assignment.

These limits are asserted in a deterministic insertion/deletion interleaving test, including successful catch-up on a subsequent refresh. The next Broadcast consumer phase must use complete reads with invalidation/coalescing and reconnect catch-up. That phase remains unimplemented here; no automatic eventual-convergence guarantee is claimed yet.

Memory and total transfer remain proportional to the account's full task collection. Pagination fixes truncation; it is not UI virtualization, server search, a task quota or a bounded-retry framework. Smaller accounts pay one additional empty request so unexpected lower API caps cannot silently imply completeness.

## Verification

Commands executed:

```text
pnpm exec ng test --watch=false --include=src/app/features/tasks/state/tasks.store.spec.ts
pnpm exec ng test --watch=false --include=src/app/features/tasks/state/tasks.store.spec.ts --include=src/app/features/projects/state/projects.store.spec.ts
pnpm exec ng test --watch=false
pnpm exec ng build --configuration production
node scripts/test-task-snapshot-pagination.mjs
node --check scripts/test-task-snapshot-pagination.mjs
git diff --check
```

- Final targeted stores: **113 tests passed** (99 task, 14 project), including existing F1/F2/F3/F4 coverage. No old regression tests were removed. Their refresh fixtures now implement keyset/limit calls and terminal empty pages; a few constructor-refresh assertions await completed loading rather than assuming one microtask equals a finished refresh.
- Full Angular suite: **373 tests passed in 24 files**. Nineteen new task-store cases cover empty/small/exact/multiple/capped pages, more than 1,000 rows, duplicate/changed/invalid pages, second-page transport failure, third-page API rejection, foreign ownership, account changes, supersession, local saves/deletion tombstones, stable UI order and concurrent server insertion/deletion.
- Production build: **passed**. Existing stylesheet warnings remain: TaskRow **7.62 kB**, AppSidebar **4.31 kB**; no budget error.
- Syntax and whitespace checks: **passed**.

The initial sandboxed test invocation hit a Windows temporary-cache EPERM before running tests. The actual red reproduction and all reported passing runs were executed successfully outside that cache restriction. Deferred promises and explicit page-start gates control the substantive race tests; no arbitrary race-timing sleeps are used.

## Real local Supabase evidence

[Executable local check](../../scripts/test-task-snapshot-pagination.mjs) and [recorded result](task-snapshot-pagination-results.json): **five check groups passed** on a fresh disposable Supabase CLI 2.120.0 / PostgreSQL 17.11 stack using the actual checked-in migrations and configuration (`max_rows = 1000`). It uses actual GoTrue A/B users and their SDK/Data API requests, with no hosted keys or application environment credentials.

1. Inserted 1,205 owner tasks through the real API; a single query requesting 2,000 returned exactly 1,000, demonstrating the configured cap.
2. Matching SDK keyset queries retrieved all 1,205 expected unique IDs in four requests (500, 500, 205, empty).
3. Account B saw only its own task, and A's complete pages contained only A's ownership.
4. Deleting an already-read earlier task between pages caused no offset skip; the next complete read removed that task.
5. Raw tasks publication membership remained absent and replica identity remained default. No Broadcast/Realtime configuration was changed.

This script establishes the **real SDK/API pagination contract**, not an instantiated Angular TasksStore end-to-end test. The injected-client Angular tests establish actual store reconciliation, session ownership and failure behavior. The script copies migrations unchanged into a new manifest-owned loopback stack, stops it with `--no-backup`, and never resets/adopts the existing application's local database. No visual/browser acceptance is needed for this store-only change.

## Review and remaining work

Self-review checked cursor progress/duplicate detection, lower-cap handling, atomic application, page-level API rejection, session/supersession paths, error/loading ownership, whole-request revision lifetime, unchanged display ordering and scope. No policy, SQL migration, task mutation, Realtime subscription or UI code changed. Independent review of the asynchronous correctness change is recommended before deployment. Complete reads are a prerequisite, not approval to deploy the private Broadcast migration or a replacement for its privacy review.

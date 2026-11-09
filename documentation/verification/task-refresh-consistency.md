# Task refresh consistency (F2 and F4)

## Reproduction

On main after PR #64, a deterministic deferred-Promise regression started a content mutation, started refresh while the write was pending, completed the successful save, then returned the refresh's older snapshot. The test failed: the saved title and Markdown description reverted. After the change, it passes.

## Established invariants

- Existing per-task revisions advance at mutation start and again after the queued mutation callback settles, including rollback. Settlement is awaited before advancing the revision. The pending-task set protects a mutation while active; the changed revision protects its confirmed or rolled-back state after pending tracking ends.
- Refresh snapshots revisions at query start. If a task changed during that query, the existing merge keeps its current local row. If the row was deleted, the retained revision acts as a tombstone and the stale row stays absent. Rows missing from the response are likewise retained when locally changed. No global refresh blocking is introduced.
- A query begun before a mutation sees its start revision change; a query begun during one sees either pending status or its settlement revision change. A query begun after settlement may accept fresh server data normally.
- Only the latest-started refresh in the current observed session can merge rows, set a refresh failure, or clear refresh loading. Its guard checks request identity, session generation, and the current auth user ID, including before the auth effect runs.
- Superseded successes resolve without store writes. Superseded failures still reject to their explicit caller without changing store error/loading state. Automatic refresh callers retain their existing catch. A newest-request failure remains visible until another operation clears it; an older success is not a fallback after that failure.

Refresh ownership governs refresh requests, not a new global error arbiter. Existing mutation/creation error reporting and per-task serialization remain unchanged. Remote requests are not cancelled.

## Verification

- Focused TasksStore and ProjectsStore run: 82 tests passed (68 task, 14 project). This includes all project session-isolation regressions from PR #64.
- Full suite: 289 tests passed across 22 files.
- Production build: passed. Existing stylesheet warnings remain: TaskRow 7.62 kB and AppSidebar 4.31 kB, both below the 8 kB error threshold.
- git diff --check: passed.
- Added 16 deterministic tests covering content and domain mutations, refresh-before/during/after mutation, successful saves, rollback, deletion/tombstones, overlapping responses in either order, current failure/retry, and stale session errors/loading. Tests use the injected fake client, not production data.
- Reviewed the diff for unrelated changes: no UI, project-store, database, RLS, authentication configuration, queue replacement, or Realtime subscription changes.

## Scope and remaining limitations

F3 (optimistic creation IDs and Realtime insert duplication) is deliberately unchanged. This does not implement server-side versioning or solve arbitrary conflicting edits from other clients. Existing same-user token/session semantics and other previously documented lifecycle concerns remain separate work. Database authorization is unchanged; frontend race tests are not an RLS audit. No browser checks are required to establish these store-level asynchronous interleavings.

# Async action error recovery (F7)

## Audit and reproduction

Baseline: main after PR #68 (`6adbe0a`). Reviewed AGENTS.md and the dated Current Status, Roadmap and Decisions documents against current code.

Confirmed red regressions before production changes:

- Reordering against a neighbor with an uninitialized position threw before persistence. The page caught it but only logged to console; the task header had no error and the user had no recovery action.
- Automatic project loading rejection was caught and recorded by ProjectsStore, but the shell did not display it or provide a retry control.

The audit also found task completion/project assignment bound directly to rejecting store APIs and deletion confirmation using an uncaught void call. Their regression tests established that the raw store error already appeared in the header; the original output-emission harness did not produce a separate native unhandled-rejection report. The missing rejection boundary was evident in the bindings/callback, so these now call explicit smart-page handlers with try/catch. No claim is made that those three tests were red native-rejection reproductions.

## Already handled correctly

- TasksStore mutations record errors and perform optimistic rollback; the task header already displays the store error.
- Content editing catches rejection and retains drafts with inline feedback.
- Scheduling catches errors, survives intentional popover dismissal, and provides Retry scheduling.
- Bulk scheduling catches failures and reports partial progress.
- Shell task/project dialogs catch current-session failures and invalidate obsolete sessions (PR #67).
- Automatic task/project refresh catches are present; PRs #64/#65 protect data, error and loading ownership.
- Background single-task reconciliation failures use the existing console path; changing Realtime recovery policy is outside this PR.

## Corrections and feedback policy

TasksPage now catches completion, assignment, deletion, task refresh, drag scheduling and reorder failures at explicit page boundaries. The existing page error signal supplies fallback feedback for failures not recorded by the store, such as ordering calculations. The existing header shows either this message or the store error in one alert; no toast or second task-error panel was introduced. Newer task actions clear page feedback. A local version, auth ownership and DestroyRef prevent obsolete local responses from updating another account, a navigated page, or a destroyed page. Navigation/account changes also close obsolete task confirmations, and acceptance rechecks ownership.

A Refresh task list action accompanies task errors. It calls the existing refresh API with a catch and loading/mutation guards. It refreshes data only: mutations are never automatically replayed. Completion, project assignment and deletion retry through their original controls, including deletion confirmation.

ProjectsStore has one refresh-specific loadError signal because its existing shared error also describes CRUD failures already shown in dialogs. Only the latest current-session refresh may set/clear loadError. It remains visible during retry, clears on success or account change, and cannot be set by CRUD. AppShell renders a concise project-loading alert and guarded Retry loading projects button inside the existing sidebar, so the same recovery surface follows the CDK portal into the mobile drawer. Collapsed desktop navigation must be expanded to access it. Current project data and existing persistence APIs are retained.

No queue, optimistic rollback, task-store behavior, planned/due semantics, hierarchy rules, Auth/RLS configuration, database or Realtime reconnect policy changed. Styling is limited to semantic padding/error color for the new sidebar alert.

## Verification

- Focused TasksPage/ProjectsStore/project-loading run: 91 passed (73 page, 14 project store, 4 shell loading tests).
- Full suite: 354 passed across 24 files, including store rollback/queue and prior correctness regressions.
- Production build: passed. Existing TaskRow 7.62 kB and AppSidebar 4.31 kB warnings remain, below the 8 kB error threshold.
- git diff --check: passed.
- Added 13 task-page tests and 4 real-ProjectsStore shell-loading integration tests. Existing project-session tests now also assert loadError isolation. Other fixture edits only provide the new signal.
- Deferred requests cover network failure, pre-persistence ordering failure, retry success/failure, duplicate retry prevention, late account/navigation failures, obsolete delete confirmation, load-versus-CRUD distinction and restored project navigation. Existing scheduling/content/bulk/dialog success and failure coverage remains passing.
- Self-review checked ownership, single-message rendering, retry semantics, loading ownership, sidebar portal placement, stale confirmation acceptance and scope. Existing reactive-form test warnings are unrelated.

## Remaining limits

A failed response can follow remote persistence, so refresh may reveal a remotely completed write; automatic mutation retries are deliberately avoided. Refresh does not repair genuinely invalid persisted ordering fields or implement ordering initialization. Existing specific scheduling/content/bulk feedback surfaces are unchanged; this PR adds no duplicate message for the newly handled basic task actions. Router failures and background Realtime reconciliation/reconnection policy were not changed without a demonstrated defect in this scope. No physical-device/browser visual acceptance or database authorization audit was performed; component tests cover controls and recovery state.

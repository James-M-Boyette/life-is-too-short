# Shell dialog session safety (R1)

## Baseline and demonstrated defects

Based on main after PR #66 (`c5aa9a1`). Read AGENTS.md and the dated Current Status, Roadmap, and Decisions documents; current code/merged PRs take precedence over their older project-page status descriptions.

Eight initial regression tests failed before production changes:

- Task creation, sidebar project creation/editing, and sidebar deletion confirmation remained visible after a direct A-to-B change. Task/project drafts remained in the editor.
- A late task-create rejection displayed Account A's failure in Account B's UI.
- Task creation and sidebar edit/delete submissions immediately after an account change, before the closing effect ran, still emitted obsolete store intentions. These tests do not demonstrate a database authorization bypass: stores/RLS provide independent protections.

A subsequent deferred test also reproduced an unhandled rejection when deletion succeeded but its task-refresh reconciliation failed after account switching. The test runner reported the unhandled rejection even though its DOM assertions passed; the shell handler now catches that Promise.

## Risks not reproduced / existing protection retained

Existing project-page owner/request checks already prevented late project errors and cross-account delete navigation in the covered A-to-B sequences. No new CRUD, authorization framework, or replacement coordinator was justified. Normal deletion, duplicate confirmation prevention, page-trigger focus restoration, same-account navigation during deletion, and mobile drawer interactions continue passing their established tests.

New ownership tests additionally ensure that resetting pending flags at a session boundary cannot let old finally/catch/success paths reset the new session's pending dialog, close it, or restore obsolete focus. A same-account page save dismissed by navigation likewise cannot reset a newer sidebar save.

## Correction and responsibilities

AppShell retains dialog ownership and adds only local account-owner and generation fields. An effect observes userId transitions; shell opening methods also synchronize before opening. A transition force-closes TaskCreateDialogService context and project dialogs, clears editing/deletion targets, errors, expansion requests and pending flags, and closes the old drawer without restoring its old focus.

Submission handlers check the current user against the dialog owner synchronously, covering the interval before the effect runs. Async completions check both account and captured generation plus existing task/project request context. Generation distinguishes observed logout/relogin as the same user from the original session. Project lookups used for dialog targets/defaults must belong to the active user. Pending project operations cannot be replaced by another sidebar open request.

Cleanup/focus callbacks are session-owned too; normal current-session save/cancel focus behavior is retained. Existing page-request and task-context objects are reused; no extra interaction counter or generic dialog framework was needed. TaskCreateDialogService, ProjectDialogService, stores, database operations, deletion RPC semantics, and editor components are unchanged.

Successful deletion still reconciles task data after same-account navigation, even if the initiating dialog is gone. That reconciliation is independent of dialog cleanup. A rejected refresh is caught because TasksStore already owns its current-session error. Integration coverage verifies that a current refresh error stays visible on the task page and that successful deletion can navigate off the deleted project. An obsolete session cannot initiate reconciliation after deletion or navigate afterward.

## Verification

- Targeted shell/dialog run: 43 tests passed (25 new lifecycle tests, 11 existing responsive-shell tests, 7 project-page integration tests).
- Full final suite: 327 tests passed across 23 files, including the existing F1/F2/F3/F4 store regressions.
- Production build: passed. Existing stylesheet warnings remain: TaskRow 7.62 kB and AppSidebar 4.31 kB, below the 8 kB error threshold.
- git diff --check: passed.
- Added 25 shell lifecycle tests plus one project-page integration test; deferred Promises control requests and the integration assertion awaits Router NavigationEnd. Existing tests were retained.
- Self-review checked before-effect submissions, success/catch/finally ownership, observed A-to-B and logout/relogin boundaries, context clearing, pending reset, duplicate submissions, focus callbacks, same-account deletion reconciliation, and scope.
- Existing reactive-form disabled-attribute warnings appear in tests; no editor refactor was performed to silence them.

## Limits and deferred work

Remote persistence already started may complete; this closes obsolete UI and ignores its responses rather than cancelling database operations. Boundaries use the existing AuthStore userId signal: same-user token renewal is not a new account, and an intermediate transition not observed by that signal cannot be distinguished. Session tests use fake stores, not production accounts or database authorization tests. Browser/physical-device checks of PrimeNG focus timing, animations, and screen-reader behavior remain recommended, especially Safari/mobile drawer transitions. Independent review is recommended before deployment for this authentication-lifecycle change.

No project hierarchy constraints, editor draft-preservation redesign, Realtime reconnection changes, styles, services, stores, or migrations were added or modified.

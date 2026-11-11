# Codebase review, pass 1 — Architecture and performance

Baseline reviewed November 11, 2026 against main source at `7d6c02a`. The project sidebar and project-page actions from PRs #61 and #63 are implemented and merged. Production uses API-only synchronization. Hosted Broadcast is deferred. This report records the pre-fix review findings and its measured baseline.

## Priorities

| Priority | Finding | Recommended follow-up |
| --- | --- | --- |
| P1 | [ProjectsStore](../../src/app/features/projects/state/projects.store.ts) can apply an older same-account snapshot after a confirmed create, update or delete. It protects the current session and the newest refresh, but successful mutations did not invalidate an in-flight read at the review baseline. | Reproduce with a deferred query and add a bounded, mutation-aware refresh guard. Preserve loading and error ownership. |
| P1 if email confirmation is active | [AuthStore](../../src/app/shared/supabase/auth.store.ts) supplies an email callback URL that has no active [route](../../src/app/app.routes.ts). The dormant callback passes a full URL to an SDK method that expects a code. AppShell also sees the initial null session before asynchronous restoration. These are source observations without hosted or browser reproduction. | Confirm supported invite/signup and cold-start deep-link behavior. If warranted, add an explicit initialization state and one owner for callback and redirects. |
| P2 | [TaskRow](../../src/app/features/tasks/components/task-row/task-row.component.ts) converts the project tree separately for each row that evaluates its project options. Work can grow with both rendered rows and project count on mount or project refresh. | Profile selector and menu creation in the browser. Consider lazy selector creation or shared stable lookup data if material. Check PrimeNG option-node mutation before sharing tree instances. |
| P2 | [TasksStore](../../src/app/features/tasks/state/tasks.store.ts) gives background snapshots a 30-second deadline. A stalled foreground refresh can keep loading active and delay the background scheduler. | Reproduce with a deferred foreground request before adding a bounded read lifecycle. Preserve complete snapshots, takeover and session ownership. Treat ambiguous writes separately. |
| P2 | TaskRow is 7.62 kB against an 8 kB style error limit. AppSidebar is 4.31 kB. | Recover measured TaskRow headroom before expanding the card. Keep budget limits and verify responsive and drag geometry in a browser. |

## Component boundaries

| Component | Responsibility and recommendation |
| --- | --- |
| TasksPage | Route views, derived lists, task-action feedback and scheduling orchestration. Keep the scheduler page-hosted so a task moving lists does not destroy its overlay. Extract pure placement or grouping functions if this logic grows. |
| TaskRow | Row presentation, edit entry points, focus and UI integrations. Typed outputs hand off persistence. Existing Markdown and content-editor boundaries are useful. The project selector has the clearest opportunity for a narrower lifecycle. |
| TaskList | Adapts CDK events and rendered indices to task intentions. Keep group headers and sorting predicates under one Today drop list to preserve placement semantics. |
| TasksHeader and TaskScheduler | Small presentation boundaries for view controls and date selection. Keep persistence in the page and store. |
| AppShell | Responsive navigation, single sidebar portal and dialog lifecycle across routes and sessions. A project-dialog host may be justified if flows grow. Move a complete lifecycle with its tests if that happens. |
| AppSidebar | Nested project navigation, expansion and one shared popup. Emits dialog intentions. Tree rebuilding is linear per sidebar change. Profile large trees before adding incremental state. |
| ProjectEditor | Separate effects initialize drafts, rebind parent options and manage reactive-form disabled state. This preserves a draft across tree refreshes. |
| TaskCreate, TaskContentEditor, TaskDescription, TopBar and AccountControls | Coherent presentational responsibilities. Markdown parsing is computed from source. The suite emitted reactive-form disabled-binding warnings. Address with a focused form-state change if that area is next touched. |
| Login and callback | Auth orchestration belongs with the route and AuthStore. Verify the active flow before changing routing or session initialization. |

Signals, computed derivations, typed inputs/outputs, standalone components and stable task IDs in modern templates fit this application. Effects are justified for external lifecycles, forms, overlays, focus and session state. RxJS fits breakpoint and navigation streams. Promises fit the serialized store mutations.

## Stores and services

Keep optimistic IDs, per-task queues, revisions, deletion protection, refresh ownership and session isolation together in TasksStore. They jointly determine which response may update visible data. If the file becomes difficult to evolve, the paginated read path is the first useful extraction. Give it the client, expected owner and abort signal and return a complete validated snapshot. Keep request ownership, revision merge, optimistic rollback and user-visible error state in the store. A pass-through repository adds little. A synchronization coordinator merits reconsideration if lifecycle or retry policy needs independent reuse or is difficult to test.

ProjectsStore already has injected data access and account/session checks. Its single ordered refresh can be incomplete above the Data API row cap. Establish the expected project-count envelope before adding pagination. Fix the same-account race first.

The shell-scoped task-create and project-dialog services coordinate entry points and reuse shell dialogs. They do not need to own persistence or duplicate state.

## Performance measurements

Medians from 15 warmed Node samples using the actual tree conversion, lookup and task sort utilities with synthetic inputs. These measurements exclude Angular, PrimeNG, layout, networking and mobile hardware.

| Rendered rows / projects | Per-row tree conversion plus lookup | One conversion plus lookups | One task sort |
| --- | ---: | ---: | ---: |
| 100 / 20 | 0.06 ms | 0.03 ms | 0.01 ms |
| 1,000 / 100 | 1.26 ms | 0.25 ms | 0.07 ms |
| 5,000 / 100 | 6.15 ms | 1.22 ms | 0.37 ms |

Profile task-row mounting, menus, selectors and Markdown, then a no-change refresh. Stable task IDs retain row instances while full snapshots can replace their inputs. Today Planning scans each group and Upcoming scans by displayed day. Consider one classification pass only if measured. Preserve planned-over-due placement, manual subgroup order and overdue indicators.

API-only snapshots read up to 500 rows per page and terminate on an empty page. A 5,000-row snapshot at that size requires 11 requests. The 120-second safety interval is gated by visibility and connectivity. Multiple visible tabs can each fetch a full snapshot. Measure requests, bytes and rendering on representative devices before changing the interval or adding caching or virtualization.

## CSS and verification

- TaskRow's compact queries, projected edit controls, metadata and CDK preview/placeholder rules contribute to the size. Look first for repeated selector scoping and identical control declarations. Preserve local encapsulation, responsive boundaries and interaction states.
- AppSidebar's tree rows, actions, focus and touch styles account for much of its surface. Three narrowly scoped PrimeNG overrides support custom tree interactions. Prefer a supported hook only if it preserves those behaviors.
- Use existing semantic tokens. Imported Sass partials alone do not shrink compiled output. Measure emitted styles and validate browser geometry, focus, touch and dragging.
- `pnpm exec ng build --configuration production` passed. Initial output was 467.74 kB raw and 107.47 kB estimated transfer. The named TasksPage lazy chunk was 291.09 kB raw. Style warnings were TaskRow 7.62 kB and AppSidebar 4.31 kB against the configured 4 kB warning and 8 kB error limits.
- `pnpm exec ng test --watch=false` passed 393 tests with two opt-in database tests skipped. The Windows sandbox initially denied a temporary-cache rename before test execution. The local run outside the sandbox passed. Existing coverage includes session boundaries, optimistic writes, refresh interleavings, scheduling and drag placement, editor drafts and dialog lifecycles.
- `git diff --check` passed. No hosted operations or browser/device profiling ran.

Sequence the ProjectsStore correction first. Validate the supported Auth flow before changing it. Then measure row creation and refresh behavior and recover TaskRow stylesheet headroom before larger card work. Pass 2 readability and Pass 3 educational documentation remain separate.

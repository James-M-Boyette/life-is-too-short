# Mobile task dragging

## Scope and implementation

Branch: `codex/mobile-disable-task-dragging`, based on main `7fb7059` after PR #59 merged.

TasksPage derives drag availability once from CDK BreakpointObserver using the same shared `(width < 768px)` query as AppShell. TaskList and TaskRow retain their existing inputs and CDK disabled bindings. Disabled lists reject late drop/sort events; the page also rejects late scheduling/reorder intentions. No store, ordering calculation, scheduling semantics, or database changes.

Mobile CSS removes the external handle margin and grab cursors independently of the 32rem compact-card container query. Drag-only planning insertion targets and the Unscheduled drop hint are omitted while dragging is unavailable. Desktop card/preview/placeholder rules remain intact.

## Automated verification

- Targeted TaskRow, TaskList, TasksPage: 89 tests passed.
- Full suite: 235 tests passed in 20 files.
- `pnpm exec ng build --configuration production`: passed.
- `git diff --check`: passed.
- Existing stylesheet warnings remain: TaskRow 7.62 kB and AppSidebar 4.36 kB exceed the 4 kB warning threshold; neither exceeds the 8 kB error budget. No budget changes.
- Full suite also emits the existing reactive-form disabled-attribute advisory in AppShell tests.

New regression tests cover viewport transitions across Today, Upcoming, Inbox, and Project views; row/list disabling and restoration; no writes during resizing; late list/page event rejection; and restored desktop sorting. Existing component tests protect editing, scheduling, project controls, links, and drag planning/order behavior.

## Browser acceptance

Checked the real components in the ignored local acceptance workspace with synthetic tasks/stores and no backend writes, using Chromium viewport overrides.

| Viewport | CDK rows/lists | Handle | Card left margin | Card cursor | Horizontal overflow |
| --- | --- | --- | --- | --- | --- |
| 375px | Disabled | Absent | 0px | auto | None |
| 390px | Disabled | Absent | 0px | auto | None |
| 430px | Disabled | Absent | 0px | auto | None |
| 767px | Disabled | Absent | 0px | auto | None |
| 768px | Enabled | Present | 16px | grab | None |

At 768px, cards measured approximately 405px wide: compact desktop cards retain their handles and dragging. Repeated resizing restored the appropriate CDK flags and presentation. A mobile card-surface pointer drag produced no floating preview. Title editing/cancel, scheduling open/Escape, More actions, completion, Markdown/project link destinations, and independent main-content scrolling were checked. Completing a task updated Completed to 1 in the synthetic fixture.

At 1280px, desktop card-surface dragging produced the full-card floating preview with 1.5deg rotation and an insertion placeholder. No production drag markup, preview CSS, ordering utilities, or persistence paths were changed.

## Review and limitations

Reviewed breakpoint ownership, subscription cleanup, disabled list predicates, late-event guards, styling specificity, and preservation of desktop/container-query behavior. No new security or data-access boundary is introduced.

Physical touchscreen momentum scrolling and mobile Safari remain device acceptance checks. Browser viewport tests use pointer input, not physical touch. A desktop drag already active when the viewport crosses the breakpoint remains CDK-owned until pointer release; disabled list/page guards discard its late drop, preventing task mutations. No private CDK cancellation API or custom pointer tracking was introduced.

# Project-page actions verification

## Architecture

TasksHeader exposes an optional projected actions slot and remains a generic heading. TasksPage supplies the project-only trigger/menu and validates the active project and session. AppShell provides ProjectDialogService at shell scope and handles its synchronous typed Edit/Delete intentions. The coordinator holds no project data, pending context, persistence state, or generalized event types. This avoids coupling TasksPage to AppShell, route-outlet output wiring, and a second project CRUD implementation.

AppShell retains the existing ProjectEditor, delete confirmation, save/delete handlers, ProjectsStore operations, delete_project RPC semantics, task refresh, and navigation to Inbox when the current project is deleted. ProjectsStore, schema, migrations, permissions, and deletion SQL are unchanged.

## Reliability and focus

Requests include project ID, user ID, source URL, and the originating button. Both the page and shell validate current context; duplicate menu commands are discarded and already-open/busy project dialogs reject repeated requests. Route/session changes dismiss stale page menus and page-originated dialogs. Submission handlers recheck context before invoking persistence and ignore stale completion/error UI after invalidation, including a session check after task refresh.

PrimeNG owns menu keyboard navigation, Escape and outside dismissal. Ordinary dismissal restores focus appropriately; selecting an action suppresses menu focus restoration so the modal owns focus. Cancelling a page-originated dialog returns focus to its connected page trigger. Sidebar actions retain their existing drawer/modal focus behavior.

In-flight persistence is not cancelled by route changes: a confirmed operation may still finish, while stale UI feedback/navigation is suppressed. These client checks do not establish database authorization or replace the outstanding isolated RLS/store-lifecycle security audit.

## Automated verification

- Focused page/header/sidebar/shell/integration run: 90 tests passed; an additional immediate session-change confirmation regression also passed (5 integration tests total).
- Final full suite: 257 tests passed across 21 files.
- pnpm exec ng build --configuration production: passed.
- git diff --check: passed.
- Existing stylesheet warnings only: TaskRow 7.62kB and AppSidebar 4.31kB exceed the 4kB warning threshold, below the 8kB error budget. No budget changes or new component warnings.
- Existing reactive-form disabled-attribute advisories and JSDOM modified-link navigation notices remain.

New coverage protects project-only/owned-project visibility, correct Edit/Delete context, duplicate commands, Escape/outside dismissal, stale menu context, real page-to-shell modal reuse, cancel/focus behavior, successful deletion routing, route/session invalidation, immediate stale confirmation, and late failed-delete feedback. Existing store CRUD/deletion behavior was not redundantly retested.

## Browser acceptance

Real components ran in the ignored local fixture with synthetic stores; no backend writes were performed.

- Desktop: Enter opens the menu without navigation; Escape returns focus to the trigger. Both actions match sidebar labels/icons/danger styling.
- Edit opens the existing prefilled editor. Delete opens the existing confirmation. Both were cancelled. Modal focus eventually moves inside the existing dialog; the leaving menu does not reclaim it. Cancel returns focus to the project-page trigger.
- Mobile 375px, 390px and 430px: a long project heading wraps without document overflow; the button remains at the heading's right with a 44px square touch target. The compact popup fits within the viewport.
- Desktop navigation to Today while the page menu is open removes the popup and project-only trigger. The existing sidebar menu still works independently, with one sidebar instance.

Physical iPhone/Safari/VoiceOver and touchscreen acceptance remain device checks. Browser fixture checks do not establish production authorization or deployment acceptance.

## Review and status

Reviewed duplicated-dialog avoidance, current project ownership checks, duplicate action suppression, route/session races, focus handoff, long names, CSS budgets and unchanged scheduling/task behavior. No Sections, archiving, duplication, sharing, reordering or other roadmap features were added.

The four project-context documents mark PR #61 sidebar work as merged and project-page actions as implemented on this branch, pending review/merge. No claim is made that this new feature is already on main.

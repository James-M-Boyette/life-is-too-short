# Current Status — Life Is Too Short

*Reviewed November 8, 2026. GitHub main baseline: `899b78d`. Verify current branch and PR state before acting.*

## Product and stack

Life Is Too Short is a deployed early-beta Angular 21 / PrimeNG 21 / TypeScript / Supabase task manager. It uses pnpm, Angular CDK, Vitest, Supabase Auth, PostgreSQL and Realtime. Existing early testers use it; this is **not** evidence that invitation-only signup, security audit or wider beta readiness is complete.

## Implemented and merged into main

### Tasks and scheduling

- Task and project CRUD, nested projects, project reparenting with cycle detection, and project deletion using an existing Supabase RPC.
- Manual ordering, task-project assignment, optimistic changes, rollback, queued mutations, Realtime reconciliation and session-change safeguards.
- Unified atomic task title/Markdown-description editing with safe Markdown display; no WYSIWYG editor.
- Separate planned dates (intentions) and due dates (obligations), with a two-tab quick-date/inline-calendar scheduler.
- Today and Upcoming, Overdue and Unscheduled groups, and planned versus due-only Today grouping. Due-only unplanned tasks may appear in Today; overdue warnings remain when tasks are intentionally planned later.
- Desktop drag-to-plan, drag-to-clear and reorder interactions, including floating card previews and insertion placeholders.

### Responsive experience

- One TaskRowComponent adapts with CSS container queries to expanded and compact presentation.
- Application mobile viewport breakpoint is 768px, separate from card container widths.
- Below 768px, task drag/drop is deliberately disabled and the external handle/margin removed; compact cards in desktop board columns remain draggable.
- Mobile navigation drawer reuses the existing sidebar via CDK portal.
- Desktop sidebar can collapse to a navigation rail, expand to its remembered width, and be resized.
- Account menu moved into the sidebar; Appearance contains the palette selector; account identity and logout remain available.
- The redundant desktop top bar is gone, and routine Realtime on/off diagnostics are visible only in Angular development mode. Development mode is **not** a privileged user role.

### Quality and deployment

- Existing behavior-focused tests and GitHub Pages deployment; PR #60 reported **235 tests passing** and a production build, not a guaranteed permanent count.
- A CSS-budget hotfix was merged after TaskRow briefly exceeded Angular's 8 kB component-style production limit. Budget warnings still warrant attention.
- Verification notes under `documentation/verification/` document browser-fixture checks and their limitations.

## Work in progress, not merged

**PR #61 — `codex/project-sidebar-navigation`** currently implements name-click navigation, separate nested-project chevrons and active ancestor expansion. Its initial revision removed Edit/Delete access without replacement. It must gain a working sidebar three-dot menu before merge.

A **separate subsequent PR** is planned for the project page's upper-right three-dot menu, reusing the existing project Edit/Delete dialogs and confirmation.

**Mobile Today and Upcoming** design should follow these project interactions. Current mobile shell and card responsiveness do not mean their complete mobile user experience has been redesigned.

## Important work not verified complete

- Supabase unrestricted signup disabled and invitation-only onboarding enforced.
- RLS, cross-account denial, nested project deletion and `delete_project` authorization verified against an isolated database.
- Production backup actually restored into an isolated environment.
- Resource limits, rate limits, suspicious activity monitoring, spend caps and alerts.
- Physical iPhone/Safari/VoiceOver/touch acceptance and full relevant accessibility review.
- Real-account production integration and reliable deployment acceptance for every new feature.

Do not expand invited users until security, recovery, cost and honest beta/privacy/support disclosures are ready.

## Next steps

1. Finish and review PR #61's sidebar project actions without losing nested navigation.
2. Implement project-page More actions in its own focused PR; reuse existing dialogs and persistence.
3. Design mobile Today/Upcoming information hierarchy, interaction and navigation; retain planned/due distinctions.
4. Continuously address security, backups, accessibility, resource abuse, reliability and test coverage.
5. Complete initial quality-of-life improvements, then recurring tasks, second UI/UX polish and Habit Tracker.

The current code, migrations, tests and GitHub PR state outrank this dated snapshot. Never treat an open PR, a passing unit test, or the existence of a script as proof of production readiness.

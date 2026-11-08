# Product Roadmap — Life Is Too Short

*Reviewed November 8, 2026. This is intended sequencing, not a fixed schedule or list of missing features.*

## Completed code foundation (merged, acceptance still ongoing)

Task and nested-project CRUD; authenticated shell; manual task ordering; Markdown descriptions and unified atomic content editing; planned and due dates; Today/Upcoming/Overdue/Unscheduled; desktop drag scheduling; compact/expanded responsive cards; mobile navigation drawer; desktop collapsible sidebar and navigation rail; account Appearance/logout; and mobile no-drag behavior below 768px.

**Implemented** never automatically means fully audited, accessible on a physical device, or safe for wider user onboarding.

## Current UI/UX work — Projects

1. **Project sidebar, merged in PR #61:** name-click navigation, separate child expansion chevrons and an accessible shared three-dot menu with Edit/Delete.
2. **Project page, implemented on `codex/project-page-actions`, not yet merged:** upper-right three-dot project actions, reusing the same editing dialog, deletion confirmation and store.
3. Preserve deeply nested project navigation, accessible keyboard/touch behavior and mobile drawer focus.

Project **sections** are *not* child projects and are not authorized in these PRs.

## Next UX work — Mobile task views

Design before implementing Today/Upcoming on phones. Preserve the difference between planned intentions, due-only obligations and overdue work; evaluate stacked groups, mobile navigation between dates, quick capture, scheduling overlays, touch targets and scrolling. Review Inbox/Project task presentation too. Do not re-enable mobile drag by default. Explore accessible non-drag manual ordering as a later option.

## Continuous prerelease gates — Security, recovery, operational readiness

- Audit Supabase RLS and allowed/denied cross-account requests, Auth registration/invite-only restrictions and service credentials.
- Test destructive project RPCs, ownership validation, migrations and session-race protections.
- Prove backup *restoration*, not only backup creation.
- Enforce reasonable database content/count limits, creation-rate defenses and budget/usage alerts before broader invitations.
- Complete privacy, retention, administrator-access, beta expectations and support communications.
- Verify accessibility and actual mobile/browser behavior.

These are **not** tasks to defer behind visual polish when they block safe beta expansion.

## Initial quality-of-life wave

Continue project/task affordances, navigation, quick capture, useful keyboard interactions, reliable status/error feedback and styling/accessibility consistency. Do not expand scope with speculative tags, general collaboration, or large infrastructure.

## Planned: Recurring tasks

Distinguish calendar-anchored recurrence from completion-relative recurrence. Define skip/overdue/exception/history behavior before building.

## Planned: Dedicated second UI/UX assessment

After recurrence, revisit palettes, semantic tokens, density, usability and personalization across the whole app.

## Planned: Habit Tracker MVP

After the second UI pass, evaluate whether Habits is a distinct domain. Preserve recurrence rules, actual completion history and goal targets as separate information. Explore streaks, heatmaps and target progress.

## Exploratory: Calendar versus whiteboard

Evaluate calendar/time-blocking against cross-project visual planning based on user needs after Habit Tracker work.

## Planned: Broader invited beta only after readiness

Invite trusted friends/family with explicit data-access disclosures, support/cost expectations and practical feedback channels. No surprise charges.

## Longer horizon / not currently authorized

- **Sections within projects**, distinct from nested projects.
- Subtasks or checklists; priorities; search/filtering; reminders/notifications.
- Project archiving, duplication, reusable templates and recurring projects.
- PWA/home screen, offline behavior and potential external calendar integration.
- Incremental custom Angular component library replacing selected PrimeNG pieces.
- Travel, fitness and scoped collaboration modules.
- Portable CSV and versioned JSON export/import; optional self-hosting or perpetual-use approaches.
- Restricted administrator diagnostics and possible client-side encryption after considering search/recovery tradeoffs.

## Continuous discipline

Every phase requires proportionate tests, accurate docs, migrations, authorization, recovery, reliability, accessibility, performance and cost awareness. Follow `AGENTS.md`; confirm actual branch/PR state rather than assuming this roadmap is the deployment ledger.

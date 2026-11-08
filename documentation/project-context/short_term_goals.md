# Short-Term Goals — Life Is Too Short

*Reviewed November 8, 2026.*

## Outcome

A safe, dependable and visually coherent personal task manager ready for a small invitation-only friends-and-family beta.

## Implemented baseline

Main already includes task/project CRUD and nested projects; unified Markdown content editing; planned-versus-due scheduling, Today/Upcoming, ordering and desktop dragging; compact/expanded cards; a mobile drawer; a collapsible desktop rail; account Appearance/logout; and mobile drag disabling. Validate and polish these rather than rebuilding them.

## Immediate priorities

**1. Complete project navigation.** Sidebar PR #61 is merged with accessible More actions and Edit/Delete. Review the separate upper-right project-page actions implementation on `codex/project-page-actions` (not yet merged), reusing the existing dialogs and store. Keep the click-to-navigate and independent child-project chevron behavior.

**2. Deliberate on mobile task flows.** Design Today/Upcoming and mobile tasks around planned intentions versus due obligations. Verify dialogs, scheduling, layout, tap targets, safe areas and scroll behavior on real devices. Mobile dragging remains disabled by design.

**3. Security and database authorization (continuous beta gate).** Validate invitation-only Auth, RLS, cross-user denial and the project deletion RPC. Never rely on Angular guards, UI visibility or user-editable Auth metadata for authorization.

**4. Data reliability and operational safety (continuous beta gate).** Restore a production backup in an isolated environment; review migrations, failure recovery, Realtime/session races, quotas, rate limits, cost controls and alerts.

**5. Accessibility, style and practical QoL.** Resolve meaningful defects and relevant WCAG issues. Preserve user-friendly editing, keyboard/touch paths and production CSS budgets while refining quick capture and navigation.

## Next major features

After the immediate improvements and safety work: recurring tasks; second broad UI/UX/palette/token polish; Habit Tracker; then calendar-versus-whiteboard exploration.

## Not current scope

Sections, recurring projects, archiving/duplication, full nested tasks, travel/fitness, data export/import, E2E encryption, extensive roles, payments, public signup and a full custom component-library rewrite.

## Beta expansion criteria

Confirmed invite restrictions, cross-user security, data recovery, bounded cost exposure, basic mobile/accessibility acceptance and transparent privacy/support expectations.

An open PR is not deployed functionality. Codex must review current main, PRs and tests before implementation.

# Short-Term Goals — Life Is Too Short

*Last reviewed: November 5, 2026*

## Objective

Develop a reliable, secure, appealing daily task manager suitable for a small invitation-only friends-and-family beta.

## Existing baseline

The repository already includes:

- Task and project CRUD
- Nested projects
- Authentication
- Today and Upcoming views
- Planned dates
- Drag-and-drop scheduling
- Manual task ordering
- Today focus/planning mode

These should be validated and refined rather than assumed missing.

## Priority 1 — Validate current functionality

Review:

- Create/edit/delete task operations
- Create/edit/delete project operations
- Nested project management and reparenting
- Inbox/project assignment
- Project deletion behavior
- Scheduling and ordering
- Optimistic mutations and Realtime reconciliation

Ensure errors are visible and recoverable.

## Priority 2 — Secure the application

Before onboarding more users:

- Disable unrestricted signup
- Verify invitation mechanisms
- Audit RLS for all task and project operations
- Test hostile cross-account requests
- Audit `delete_project` RPC
- Verify client credential handling
- Establish resource limits and cost monitoring

## Priority 3 — Data reliability

- Validate production backups
- Test restoration into a safe environment
- Document recovery steps
- Maintain repeatable migrations
- Protect production against accidental local seed execution
- Add automated tests for destructive operations

## Priority 4 — Styling, responsiveness and accessibility

- Refine PrimeNG appearance
- Improve design-token consistency
- Review desktop and mobile layouts
- Fix major keyboard and focus problems
- Address WCAG A/AA requirements
- Maintain clear visual feedback for application operations

## Priority 5 — Scheduling polish

- Verify planned versus due-date behavior
- Improve Today and Upcoming
- Refine overdue and unscheduled presentation
- Test drag-and-drop and ordering edge cases
- Validate timezone and daylight-saving transitions
- Prevent conflicting asynchronous changes

## Priority 6 — Initial quality-of-life improvements

Improve the speed and clarity of:

- Capturing tasks
- Editing tasks
- Navigating projects
- Scheduling work
- Reviewing daily priorities

Prefer small improvements with clear acceptance criteria.

## Readiness criteria for beta expansion

- Invitation-only access enforced
- Authorization verified at database level
- Backup/restore tested
- Critical data-integrity issues resolved
- Core workflows functional on desktop and mobile
- Major accessibility problems addressed
- Privacy and beta expectations documented

## Explicit exclusions

Do not prioritize the following yet:

- Full Habit Tracker
- Recurring projects
- Travel and fitness domains
- Custom PrimeNG replacement
- Data export/import
- End-to-end encryption
- Payment infrastructure
- Public signup
- Full administrative dashboard

## Codex instruction

First identify gaps in current functionality and infrastructure. Recommend narrowly scoped changes on reviewable branches.

Do not begin major new features until the relevant current-state audit and dependencies are understood.

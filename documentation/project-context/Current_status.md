# Current Status — Life Is Too Short

*As of November 5, 2026*

## Overview

Life Is Too Short is a deployed, early-beta Angular/Supabase task-management application. It has progressed beyond basic CRUD into task scheduling, planning, and manual ordering.

**The immediate priority is verifying security, data safety, and the reliability of existing functionality—not rebuilding implemented features.**

## Verified in GitHub `main`

### Technology stack

- Angular 21.1
- PrimeNG 21.1
- TypeScript 5.9
- Supabase JavaScript client 2.96
- Supabase Auth and PostgreSQL
- pnpm 9.15.9
- Vitest 4
- Supabase CLI

The repository's actual dependency versions take precedence over older project documentation referring to Angular 20.

### Authentication and navigation

The codebase contains:

- Login and authentication callback components
- Authentication state management
- Lazy-loaded application shell
- Routes for All Tasks, Inbox, Today, Upcoming, and individual projects

**Verification needed:** Authentication guards, database authorization, and account-eligibility restrictions must be audited separately.

### Project management

The existing `ProjectsStore` includes:

- Signal-based project state
- Project creation, editing, and deletion
- Nested project structures
- Project reparenting with cycle checks
- Project tree computation
- A Supabase `delete_project` RPC

The behavior of destructive project operations and associated database permissions still requires explicit testing.

### Task management

The existing `TasksStore` includes:

- Signal-based task state
- Task CRUD
- Supabase Realtime subscriptions
- Optimistic task creation and mutations
- Task-specific mutation queues
- Session-change protection
- Reconciliation of asynchronous updates

### Planning and scheduling

The repository includes:

- Planned-date support
- Due-date data fields
- Today and Upcoming views
- Today focus/planning layout state
- Drag-and-drop task scheduling
- Manual task ordering
- Overdue and unscheduled task groupings
- Task deletion confirmation

These features should be considered implemented at the code level, although their complete correctness and production readiness are not established.

### Development infrastructure

The repository includes:

- Production and development build scripts
- Vitest test commands
- Local Supabase tooling
- Production database backup script
- Local database seed file
- GitHub deployment workflow

The existence of a backup script does not establish that restoration has been successfully tested.

## Known from previous development discussions

- The application is deployed through GitHub Pages.
- The developer and spouse have used the early beta.
- A browser caching issue previously prevented new deployed changes from appearing consistently.
- Backup and restoration work was underway.
- Broader onboarding was intentionally deferred until security and reliability improve.

## Not yet verified

Do not assume any of the following are complete:

- Production Supabase public signup is disabled.
- All RLS policies are secure against cross-user requests.
- The project-deletion RPC enforces appropriate ownership.
- Production backups have been successfully restored.
- Resource quotas, rate limits, and spending alerts are active.
- All task-ordering and scheduling edge cases pass automated tests.
- Mobile interactions and accessibility have passed acceptance testing.
- The deployed GitHub Pages build always matches current source.

## Immediate next steps

1. Audit current source, existing branches, and deployed behavior.
2. Verify hosted Supabase configuration, signup restrictions, RLS, and RPC permissions.
3. Complete backup/restore validation.
4. Smoke-test authentication, CRUD, nested projects, scheduling, ordering, and Realtime.
5. Fix critical defects and data-integrity risks.
6. Continue UI, accessibility, responsiveness, and quality-of-life improvements.
7. Proceed to recurring tasks after current foundations are sufficiently reliable.

## Instructions for Codex

Before implementing changes:

- Inspect the actual repository.
- Identify existing functionality rather than assuming the roadmap represents missing features.
- Report discrepancies between this document and source code.
- Explain proposed changes and relevant risks.
- Recommend small, reviewable feature branches.
- Identify acceptance tests.
- Never modify production data or security configuration without explicit authorization.

The codebase is authoritative for current implementation. The Decisions and Roadmap documents define intended direction.

Repository: `James-M-Boyette/life-is-too-short`

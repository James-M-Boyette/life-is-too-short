# Product Roadmap — Life Is Too Short

*Last reviewed: November 5, 2026*

This roadmap defines the intended order of work. It is not a list of entirely unimplemented features or a fixed release schedule.

## Phase 0 — Core task and project functionality

**Status: Implemented in repository; verification remains**

- Authentication
- Tasks CRUD
- Projects CRUD
- Nested projects
- Inbox and project assignment
- Task and project state management

**Exit criteria:** Core operations, especially cross-user access and destructive actions, pass appropriate tests.

## Phase 1 — Security and invite-only lockdown

**Status: Planned / completion not verified**

- Audit all RLS policies
- Verify authorization in SQL functions
- Disable unrestricted registration
- Establish trusted invitation procedures
- Validate ownership on nested operations
- Review service-role credential handling
- Add resource-abuse protections
- Monitor infrastructure and cost exposure

**Exit criteria:** Security testing and invitation restrictions are confirmed.

## Phase 2 — Initial UI, mobile, and accessibility pass

**Status: In progress / verification**

- Improve styling and layout consistency
- Refine initial surface/design tokens
- Improve mobile responsiveness
- Verify keyboard navigation and focus behavior
- Address applicable WCAG A/AA problems
- Improve loading, error, and confirmation interactions

## Phase 3 — Dates, scheduling, Today and Upcoming

**Status: Substantially implemented on `main`; needs validation and polish**

- Due-date and planned-date distinctions
- Today and Upcoming
- Overdue and unscheduled groups
- Drag-and-drop scheduling
- Manual task ordering
- Today focus/planning layouts

**Exit criteria:** Correctness across date boundaries, timezone changes, drag interactions, ordering, and asynchronous failures.

## Phase 4 — First quality-of-life wave

**Status: In progress / planned**

- Reduce task-entry friction
- Improve editing and navigation
- Polish existing planning workflows
- Address defects revealed through day-to-day usage
- Improve clarity and responsiveness

Prioritize high-impact improvements over speculative new features.

## Phase 5 — Recurring tasks

**Status: Planned**

Support both:

- Calendar-anchored recurrence
- Completion-relative recurrence

Define missed occurrences, exceptions, skips, history, and termination behavior before implementation.

## Phase 6 — Second UI/UX reassessment

**Status: Planned**

After recurrence:

- Revisit color palette
- Refine design tokens
- Review layout density and hierarchy
- Improve responsive behavior
- Explore limited personalization
- Reassess the complete daily workflow

## Phase 7 — Habit Tracker MVP

**Status: Planned**

- Habit definitions
- Expected activity schedules
- Completion/check-in history
- Basic streaks and activity counts
- Simple completion grid or heatmap
- Potential goal tracking

The decision about whether Habits is a separate domain remains open.

## Phase 8 — Calendar or whiteboard planning

**Status: Exploratory**

Evaluate which planning experience offers the most value.

A calendar provides time-oriented planning. A whiteboard may support flexible organization across projects.

Begin with a small validated scope.

## Phase 9 — Expand invited beta

**Status: Planned after readiness**

- Invite a limited group of friends/family
- Provide clear privacy and support disclosures
- Gather structured feedback through email/text or a lightweight intake process
- Monitor reliability and cost
- Prioritize problems supported by real usage

## Phase 10 — Advanced capabilities

**Status: Exploratory**

Possible features include:

- Global search
- Subtasks/checklists
- Advanced sorting and filtering
- Reminders and notifications
- Project archiving and duplication
- Recurring projects
- Collaboration
- Travel and fitness functionality
- External calendar integration
- Data portability

## Continuous engineering responsibilities

Throughout every phase:

- Authorization and security
- Automated testing
- Error handling
- Database migrations
- Backup/restore
- Accessibility
- Responsive design
- Performance
- Monitoring
- Cost management

## Recommended next iterations

**Iteration A: Current-state audit**

Inspect current `main`, live Supabase configuration, deployed behavior, database migrations, and existing branches.

Identify missing acceptance tests, regressions, and already-completed work.

**Iteration B: Blocker remediation**

Resolve the highest-risk security, data integrity, backup, and core workflow issues.

Then continue the first UX and quality-of-life improvements.

## Dependencies

- Beta expansion requires reliable authentication, authorization, recovery, abuse protection, and communications.
- Recurring tasks precede the second UI reassessment.
- The Habit Tracker follows that reassessment.
- Calendar versus whiteboard is evaluated after the Habit Tracker.
- Project archiving, duplication, and recurring projects remain later enhancements.

No firm release dates are committed.

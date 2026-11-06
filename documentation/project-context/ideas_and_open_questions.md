# Ideas, Questions and Concerns — Life Is Too Short

*Last reviewed: November 5, 2026*

**This document is a brainstorming catalog, not an implementation backlog.**

Ideas collected here require deliberate selection, design, and acceptance criteria before development.

## Tasks and projects

### Quick task capture

- Enter-to-add
- Keyboard shortcuts
- Natural-language due dates
- Context-aware task creation
- Reduced modal/dialog friction

### Task organization

- Priority levels
- Manual ordering in different contexts
- Search and filtering
- Saved views
- Cross-project planning groups

### Subtasks

Should the app support:

- Lightweight checklists?
- Full recursive subtasks?
- Both, with clear differences?

Avoid introducing recursive complexity before determining the user experience.

### Project archiving and duplication

Potential use case: Complete an annual garage-cleaning project, archive it, and recreate a version next year.

Questions:

- Does archiving preserve all history?
- Does duplication include completed tasks?
- Are planned and due dates copied?
- Can an archived project be restored?
- Does duplication create a template or independent project?

### Recurring projects

Possible future functionality:

- Repeat entire projects annually
- Duplicate completed project structures
- Regenerate child tasks
- Preserve historical completion records
- Handle partially completed recurring projects

The lifecycle model must be designed before implementation.

## Scheduling

Maintain distinctions between:

- Due dates
- Planned dates
- Scheduled time blocks
- Potential start dates

**Settled behavior:** Planning placement prefers `planned_date`, falling back to `due_date`; unplanned due-today tasks appear in Today, and deliberately planned future tasks may retain an overdue due-date warning. The Today view should visually distinguish intentional plans from due-only obligations; this selected feature belongs in the Roadmap, not the ideas backlog.

**Still open:** Future visual hierarchy refinements, how to surface conflicts between personal plans and deadlines, recurrence exceptions, and timezone behavior. Do not redesign the settled placement rule as an exploratory task.

## Habit Tracker

Potential functionality:

- Daily/weekly habits
- Completion grid
- Streaks
- Monthly metrics
- Goal targets
- Activity history
- Personal analytics

Example: Track 30–40 dance lessons before an event, with progress against a target.

### Architectural question

Are habits a specialized kind of task, or a separate domain?

Do not settle this question without examining the implications for recurrence, completion history, and analytics.

## Unified Today dashboard

Potentially aggregate:

- Tasks due today
- Tasks planned today
- Recurring tasks
- Habits
- Scheduled time blocks

Use a shared display model where appropriate rather than forcing every item into a single database table.

## Planning interface

### Calendar

Benefits:

- Dates and times
- Scheduling clarity
- Familiar mental model

### Whiteboard

Benefits:

- Flexible organization
- Cross-project grouping
- More expressive planning

Determine whether one or both best support actual user workflows.

## Broader product suite

### Travel

- Trip itineraries
- Transportation
- Meals
- Excursions
- Shared travel plans
- Daily scheduling

### Fitness

- Workout tracking
- Activity history
- Progress metrics
- Calendar links

### Collaboration

- Shared projects
- Shared trips
- Resource memberships
- Scoped permissions

Avoid introducing general collaboration before real user requirements emerge.

## Privacy and security

Questions worth exploring:

- What data must the application collect?
- What can an administrator technically access?
- How should privileged access be audited?
- What information should never appear in logs?
- What retention/deletion policies are appropriate?
- When might selective encryption justify its complexity?
- How should security limitations be communicated?

## Resource-abuse prevention

Tentative proposals, not final requirements:

- Maximum title/notes lengths
- Approximately 10,000 tasks per user
- Approximately 30 task creations per minute
- Monitoring and spending alerts
- Appropriate infrastructure safeguards

Validate thresholds against real behavior and Supabase capabilities.

## Business and user trust

Possible directions:

- Free personal utility
- Friends-and-family beta
- Sustainable hosted free tier
- Freemium service
- Paid premium features
- Self-hosting
- Perpetual-use arrangements

Important principles:

- Avoid surprise charges.
- Preserve access to personal data.
- Treat early testers fairly.
- Do not make privacy and security premium-only capabilities.
- Communicate changing terms in advance.

## Support and maintenance

Possible approach:

1. Critical security incidents and data loss
2. Outages and major functional defects
3. Minor bugs
4. Feature requests

Track maintenance effort and keep support commitments realistic.

## Platform and engineering

Possible future work:

- Progressive Web App
- iPhone home-screen integration
- Offline-first architecture
- Cross-device synchronization
- Versioned data export
- Import/restore
- Custom component library
- Restricted administrator diagnostics
- More sophisticated automated testing

## Architectural concerns

Continue examining:

- Smart versus presentational components
- Signal-based state
- Async operations and RxJS
- Optimistic update races
- Supabase Realtime reconciliation
- Logout/account-switch behavior
- Mutation serialization
- Data ownership boundaries
- Ordering precision and conflicts

## Decisions still needed

1. Exact recurrence behavior
2. Habit domain placement
3. Calendar versus whiteboard priority
4. Checklist versus nested-task structure
5. Project archive/duplicate semantics
6. Recurring project lifecycle
7. Invitation and support workflow details
8. Appropriate administrative visibility
9. Future pricing model
10. Portability and self-hosting scope

## Instructions for Codex

**Do not interpret ideas in this document as authorization to implement them.**

When an idea becomes relevant, first identify the intended user outcome, alternative approaches, architecture implications, scope, and acceptance criteria.

Only proceed when the feature has been explicitly selected for development.

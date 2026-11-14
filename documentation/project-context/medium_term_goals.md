# Medium-Term Goals — Life Is Too Short

*Last reviewed: November 8, 2026*

## Objective

Evolve the reliable core into a useful, enjoyable everyday planning application without creating unnecessary architectural or operational complexity.

## Current prerequisites

The mobile shell, account popover, collapsible desktop sidebar, compact/expanded cards, Markdown descriptions, combined editing and planned/due scheduling already exist on main. The immediate UI priority is completing project sidebar/page actions followed by a deliberate mobile Today/Upcoming redesign, alongside continuous security/backup readiness work.

Project **sections** remain distinct from nested child projects and are not yet approved for implementation.

## 1. Recurring tasks

Support two principal recurrence models:

**Calendar-based recurrence**

Examples:

- Every Monday
- First day of each month
- Every January 1

**Completion-based recurrence**

Examples:

- Seven days after completion
- Thirty days after the previous completion

Preserve rules separately from actual completion history.

Define behavior for skipped occurrences, overdue recurrences, exceptions, and termination.

## 2. Second UI/UX refinement

Following recurring tasks:

- Reassess the visual design
- Revisit color palettes
- Establish/refine reusable design tokens
- Improve component consistency
- Improve task density and organization
- Reassess mobile usability
- Consider practical personalization

The objective is a coherent application rather than a collection of individually styled features.

## 3. Habit Tracker

Investigate whether habits are a separate feature domain or an extension of task functionality.

Potential MVP:

- Define a habit
- Establish expected frequency
- Record completion activity
- Display a daily completion grid
- Calculate basic streaks and counts
- Track progress toward goals

Preserve the distinction between expected behavior, recorded activity, and target outcomes.

## 4. Calendar versus whiteboard planning

Evaluate both approaches after the Habit Tracker.

**Calendar:** Schedule-oriented organization.

**Whiteboard:** Flexible visual grouping, potentially across projects.

Avoid tightly coupling either presentation to task database structures.

## 5. Quality-of-life expansion

Possible priorities:

- Task priority flags
- Filtering and sorting
- Global search
- Keyboard-based quick capture
- Checklists or subtasks
- Better offline/network error handling
- More sophisticated mobile interaction

Exact sequencing remains flexible based on real usage.

## 6. Broader private beta

When sufficiently stable:

- Invite trusted friends and family
- Explain privacy and security limitations
- Explain support and cost expectations
- Provide straightforward feedback channels
- Track recurring issues and usability friction

## Engineering requirements

Maintain:

- Automated tests
- Authorization coverage
- Reliable migrations
- Backup/recovery processes
- Cost monitoring
- Accessible interfaces
- Good performance
- Responsible logging

## Avoid

- Premature microservices
- Complicated collaboration architecture
- Extensive role-management systems
- Unnecessary universal data models
- Complex recurring-project behavior before lifecycle rules are defined
- Promises of background notifications without supporting infrastructure
- Premature two-way calendar synchronization

## Success criteria

A maintainable daily productivity application that handles one-off tasks, recurring tasks, and habits in a cohesive, mobile-friendly experience.

## Design system and dark mode

- Design and approve an application-owned palette and semantic token vocabulary before broad styling implementation.
- Extend global primitives/semantics, while keeping individual component styling beside its component.
- Evaluate light/dark equivalents through semantic tokens; **dark mode is a medium-term goal**, not an immediate requirement.
- After settling palette direction, conduct a dedicated WCAG contrast review and adjust values for accessible use. Continue addressing material accessibility blockers throughout development.
- Prepare a controlled, incremental move away from PrimeNG's default aesthetic and eventually toward custom reusable UI components.
- Evaluate color as functional visual signposting for planned, due, overdue, completed, destructive, and interactive states, with labels/icons complementing color.

Refer to [Visual Design Principles](visual_design_principles.md). A palette has **not yet** been selected.

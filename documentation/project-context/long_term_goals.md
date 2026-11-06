# Long-Term Goals — Life Is Too Short

*Last reviewed: November 5, 2026*

## Vision

Develop a cohesive, privacy-conscious personal productivity suite that helps users organize meaningful activities across their lives.

The suite may eventually include tasks, scheduling, habits, travel, fitness, and collaborative planning.

Its guiding principles are usability, data ownership, fair terms, and sustainable maintenance.

## Advanced task and project management

Potential functionality:

- Project archiving and restoration
- Project duplication
- Project templates
- Recurring projects
- Nested tasks
- Advanced search and filtering
- Sophisticated priority management
- Reminders and notifications
- Flexible planning boards

## Habits and personal goals

Potential capabilities:

- Daily activity tracking
- Habit check-in history
- Streak calculations
- Monthly progress metrics
- Completion heatmaps
- Goal-based learning plans
- Numeric progress targets

These records should preserve historical information rather than simply updating one current status.

## Calendar and scheduling

Explore:

- Time blocking
- Unified daily planning
- Cross-domain calendar presentation
- External calendar interoperability
- Optional notifications and reminders

Avoid assuming every calendar event is a task.

## Travel planning

Possible dedicated functionality:

- Trips and destinations
- Day-by-day itineraries
- Excursions
- Meals and reservations
- Transportation planning
- Shared trip access
- Schedule integration

Use travel-specific data models.

## Fitness tracking

Potential capabilities:

- Workouts
- Activity history
- Fitness goals
- Habit integration
- Calendar integration

Avoid representing all fitness activity as conventional tasks.

## Collaboration

Investigate optional collaboration through explicit memberships for shared projects and trips.

Preserve individual privacy boundaries and resource ownership.

## Architecture

Continue using an incremental modular monolith until real requirements justify another approach.

Share:

- Authentication
- Application shell
- Navigation
- Reusable UI components
- Appropriate presentation contracts

Keep domain-specific data and business rules separate.

## Custom component library

Explore progressively replacing PrimeNG with a reusable Angular component library.

This is a medium-to-long-term aspiration, potentially beginning approximately six months or later.

Avoid a wholesale rewrite.

## Mobile platform

Investigate:

- Progressive Web App capabilities
- Home-screen installation on iOS
- Offline support
- Eventual native packaging if valuable

A PWA may provide substantial mobile utility without immediate App Store distribution.

## Data ownership

Eventually support:

- CSV export for interoperability
- Versioned JSON export for full-fidelity information
- Reliable import and restoration
- Potential migration from other task managers

Portability should prevent unnecessary lock-in.

These features are not immediate beta priorities.

## Privacy and security

Preserve:

- Strong authentication
- Database authorization
- Least-privilege access
- Minimal collection and retention
- Secure diagnostics
- Honest disclosures
- Meaningful account deletion

Client-side encryption may be evaluated later, taking into account effects on search, recovery, and collaboration.

## Sustainable business possibilities

Possible future directions include:

- Remaining a personal or friends-and-family project
- Offering a hosted free/freemium service
- Introducing modest paid tiers
- Investigating self-hosting
- Investigating perpetual-use arrangements

No monetization path is currently committed.

Users should not face surprise charges or coercive restrictions on accessing personal information.

## Operating philosophy

Before significant expansion:

- Understand infrastructure costs
- Measure support workload
- Establish realistic response expectations
- Automate practical maintenance
- Maintain backup and recovery capabilities
- Provide transparent communication

## Not current commitments

- Starting a company
- Public launch dates
- Paid subscriptions
- Hiring employees
- Full native app development
- Self-hosting support
- End-to-end encryption
- Multi-service infrastructure

These remain possible directions rather than authorized implementation work.

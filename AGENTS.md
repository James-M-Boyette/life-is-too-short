# Agent Behavior
When a task needs a new branch, choose a concise, descriptive branch name based on the work. Use the codex/ prefix. Create the branch when implementing the task; do not ask me to invent a name.

# Testing, Verification, and Code Quality Policy

## Primary objective

Maintain a reliable, secure, and maintainable application through proportionate, behavior-focused testing.

Use engineering judgment to decide when tests are necessary. The goal is not to maximize the number of tests or achieve an arbitrary coverage percentage. The goal is to establish meaningful confidence that the application behaves correctly, handles failures safely, and does not introduce regressions.

## When to create or update tests

For each substantive code change, assess whether the change introduces or modifies:

- Business logic or user-visible behavior
- State management or derived state
- Data creation, modification, or deletion
- Authentication, authorization, or security boundaries
- Database queries, schema, constraints, or RLS policies
- Asynchronous operations, concurrency, or error handling
- Date calculations, scheduling, recurrence, or ordering
- Interactions between components, services, or application domains

Create or update tests where a failure could produce incorrect behavior, regressions, data loss, security exposure, or meaningful user frustration.

Test significant edge cases, not only successful operations.

## When new tests may be unnecessary

Do not automatically create new tests for every change.

New automated tests may be unnecessary for:

- Purely cosmetic changes
- Straightforward HTML or SCSS adjustments
- Documentation updates
- Simple refactoring already adequately protected by existing tests
- Changes with no meaningful new behavior or regression risk

However, UI changes affecting interactions, accessibility, keyboard navigation, or conditional rendering may warrant tests.

If existing tests adequately cover the change, run those tests rather than creating redundant ones.

## Testing priorities

Choose the most appropriate and least expensive test that provides meaningful confidence.

1. Unit tests for deterministic business logic, transformations, calculations, and state transitions.
2. Component tests for meaningful user interactions, rendering behavior, inputs, and outputs.
3. Integration tests when correctness depends on multiple components, services, or actual database behavior.
4. End-to-end tests selectively for critical user workflows that cannot be adequately validated at lower levels.

Prefer focused, maintainable tests over large, fragile test suites.

## Security and data integrity

Apply heightened scrutiny to changes affecting:

- Supabase Auth
- Row Level Security
- Resource ownership
- Project and task deletion
- Database functions and RPCs
- Cross-user data access
- Input validation
- Privileged operations
- Account/session changes

Frontend tests alone cannot establish database security.

Where appropriate, use tests against an isolated local Supabase/PostgreSQL environment to verify database behavior, including authorized and unauthorized operations.

Test both successful access and denial of prohibited access.

Never use production data for automated testing.

Do not assume Angular route guards or disabled UI controls enforce authorization.

## Asynchronous behavior

When changing asynchronous operations, consider:

- Network failures
- Requests completing out of order
- Duplicate submissions
- Concurrent updates
- Optimistic update rollback
- Stale responses
- Realtime synchronization
- Logout or account changes during pending requests

Only add tests for scenarios relevant to the changed behavior.

## Regression testing

When fixing a meaningful bug, prefer adding a test that reproduces the original failure and passes after the fix.

Regression tests should protect the intended behavior rather than lock in incidental implementation details.

## Test quality

Tests must:

- Assert meaningful observable behavior
- Have clear and descriptive names
- Be deterministic and independently executable
- Avoid unnecessary mocking of the behavior under test
- Avoid brittle dependencies on private implementation details
- Reuse established test utilities when appropriate
- Avoid duplicate coverage with no meaningful benefit

Never weaken, delete, or alter legitimate tests merely to make a failing implementation pass.

Update tests when requirements legitimately change, and explain why.

Do not add meaningless tests solely to increase coverage.

## Verification workflow

After implementing a change:

1. Identify the behaviors and risks affected.
2. Review relevant existing tests.
3. Create or modify tests where justified.
4. Run relevant targeted tests.
5. Run broader regression checks when the change warrants them.
6. Run the appropriate build/type checks.
7. Investigate failures rather than ignoring them.
8. Review the changed code for security, correctness, and unnecessary complexity.

Use the repository's actual configured commands and tooling.

Do not introduce a new testing framework without a demonstrated need and explicit approval.

Do not claim that tests pass unless they were actually executed successfully.

## Completion report

For each substantive task, briefly summarize:

- What changed
- What behavior was verified
- What tests were added or updated, and why
- What verification commands were run and their results
- Any remaining risks, missing coverage, or verification limitations

If no new tests were needed, briefly explain why existing coverage or alternative verification was sufficient.

## Engineering judgment

Do not overengineer tests.

Use the simplest testing approach that meaningfully protects the intended behavior.

Avoid expanding the implementation scope simply to make code easier to test unless the change resolves a genuine design problem.

Prioritize correctness, maintainability, security, and user outcomes over test quantity.


# Review
For every substantive implementation, perform a proportional self-review in addition to testing. Look for incorrect assumptions, unhandled edge cases, security vulnerabilities, race conditions, unintended regressions, and unnecessary architectural complexity.

Do not assume that passing tests means the implementation is correct or secure. Identify plausible failure modes that existing tests might not cover, and address material issues within the approved scope. Report other concerns separately rather than silently expanding the task.

For high-risk changes involving authentication, authorization, destructive database operations, or migrations, recommend an independent review before production deployment.

# Angular Architecture and Development Conventions

## Architectural philosophy

Follow a pragmatic Smart/Dumb (container/presentational) component pattern inspired by Josh Morony's AngularStart approach.

The goal is clear separation of responsibilities, reusable UI components, predictable state management, and maintainable application architecture.

Do not apply these patterns mechanically or introduce unnecessary abstractions.

## Smart components

Smart components coordinate application behavior.

They may:

- Inject feature stores and application services.
- Read application state.
- Coordinate asynchronous operations.
- Handle application-level events.
- Transform domain data into presentation data.
- Pass data into presentational components.
- Respond to outputs emitted by presentational components.

Prefer keeping application orchestration near feature pages or designated container components.

## Presentational (Dumb) components

Presentational components primarily handle user interaction and rendering.

Prefer:

- Signal-based `input()` properties for receiving data.
- Typed `output()` events for communicating user intentions.
- Local signals for internal UI state.
- `computed()` signals for synchronous derived presentation state.
- Templates based on supplied inputs rather than independent data fetching.

Presentational components should not ordinarily inject feature stores or communicate directly with Supabase.

A presentational component may manage local UI behavior, validation, focus, and interaction state without becoming a Smart component.

## State management

Use Angular signals for synchronous reactive state.

Use `computed()` for derived state instead of manually synchronizing redundant properties.

Use `effect()` sparingly, primarily for genuine synchronization with external systems rather than propagating state between signals.

Use Promises for appropriate one-off asynchronous operations and RxJS for asynchronous streams and cancellation/composition scenarios where it adds value.

Do not introduce BehaviorSubjects, additional state-management libraries, or unnecessary observable pipelines without a clear architectural justification.

## Services and stores

Feature stores coordinate application state and domain operations.

Data access should have clear ownership and should not be duplicated across multiple UI components.

As complexity grows, consider extracting repository/data-access responsibilities from stores when it provides a concrete maintainability or testing benefit.

Use pure utility functions for deterministic transformations and calculations when appropriate.

Do not move trivial logic into services solely to satisfy architectural conventions.

## Modern Angular

Use the Angular version installed in the repository and favor supported modern Angular APIs.

Prefer:

- Standalone components
- Signal inputs and typed outputs
- Signals and computed signals
- Modern control flow: `@if`, `@else if`, `@else`, `@for`, and `@let`
- Strong TypeScript typing
- Dependency injection through `inject()` where appropriate
- Existing PrimeNG components and design tokens where practical

Avoid introducing legacy patterns into new code unless compatibility or a concrete technical constraint requires them.

## Application-specific example

For task scheduling:

- `TaskRowComponent` communicates that a user wants to schedule a task.
- `TaskSchedulerComponent` renders scheduling choices and emits the selected date and field.
- `TasksPage` coordinates the scheduling interaction.
- `TasksStore` performs the state mutation and persistence.
- Pure date utilities calculate deterministic calendar values.

This is the intended separation of responsibilities.

## Architectural tradeoffs

Before introducing a new service, abstraction, store, or component layer, consider whether it solves a real problem.

Prefer the simplest architecture that preserves clear responsibilities and supports foreseeable requirements.

When modifying existing code, respect established conventions unless a change is justified.

Explain meaningful architectural decisions and alternatives in the completion report.

Do not perform unrelated architectural refactoring during a focused feature implementation.

# Project context and status discipline

For substantive changes, consult the dated `documentation/project-context/Current_status.md`, `product_roadmap.md`, and `decisions_and_rational.md` where relevant. The ideas catalog is **not** permission to implement speculative features. The checkout, migrations, tests, and current PR status take precedence over historical docs. Do not describe open PR work as merged; update docs when an accepted change materially changes product status or a settled decision.

## Application-specific contracts

- Planned dates express intention; due dates express obligations. Today includes planned-today and unplanned due-today work. Preserve overdue warnings even when a user deliberately plans an overdue task for later.
- Project names navigate; a separate chevron expands nested children. Project Edit/Delete must remain accessible through explicit actions. Do not remove existing CRUD entry points without functioning replacements.
- Task title and Markdown description share one editing session and one atomic mutation; preserve safe Markdown rendering and unsaved-draft protections.
- Compact card container queries are different from the mobile viewport breakpoint (<768px). Mobile task drag/drop is disabled, while compact desktop cards can still be draggable.
- `isDevMode()` is not a developer/admin user authorization check. Never use editable Supabase `user_metadata` to authorize privileged actions. Privileges must be verified by trusted server/database mechanisms.

## Styling and acceptance

Prefer vertically formatted CSS/SCSS declarations (one property per line) when editing styles. Reuse semantic tokens. Respect the existing Angular compiled `anyComponentStyle` limits (4 kB warning/8 kB error); moving declarations into imported Sass partials alone does not reduce emitted CSS. Do not raise budgets merely to silence errors.

Browser geometry, focus and pointer/touch interactions require browser checks; fixture checks do not replace physical iPhone/Safari acceptance. Keep verification reports honest about what ran. Documentation-only changes ordinarily require accuracy and link review, not new automated tests.

# Application formatting

Use the pinned Prettier version through `pnpm format` and `pnpm format:check`. These commands cover TypeScript, Angular HTML, SCSS and CSS under `src/`. For a test you are already editing, use the same options and keep formatting changes local to the affected code. Existing specs are excluded from bulk formatting.

Use four spaces, single TypeScript quotes, and one CSS declaration per line. Keep imports grouped by purpose and preserve the order of side-effect imports. Group related dependencies, inputs, outputs and state where that helps readers follow the component. Avoid reordering field initializers with dependencies or effects. Use readable multiline methods and template bindings, and preserve meaningful template whitespace.

Keep mechanical formatting separate from manual readability changes. Leave migrations, generated files, dependencies, build output, lockfiles and historical reports outside bulk formatting. Review formatter changes to inline strings, templates and CSS for semantic differences.

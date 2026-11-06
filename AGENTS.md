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

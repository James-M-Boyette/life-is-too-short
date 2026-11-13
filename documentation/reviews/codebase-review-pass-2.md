# Codebase review pass 2 — Readability and formatting

Based on main at `48ed1b8`, which includes the TaskRow stylesheet optimization from PR #86.

## Formatter and scope

Prettier 3.8.1 is pinned in the development dependencies and uses the existing package configuration. It supports the Angular 21.1 template syntax. The configuration follows the existing four-space indentation, keeps single TypeScript quotes and a 100-column target, and uses strict HTML whitespace handling to preserve text boundaries. Run `pnpm format` to write and `pnpm format:check` to check.

The initial unrestricted source preview identified 83 files. The mechanical commit formats 60 application files, leaving existing specs outside bulk formatting. Generated files, build output, dependencies, migrations, and historical reports are outside this workflow. The lockfile changes cover the formatter installation only.

The manual change is confined to TaskSchedulerComponent. It groups imports and separates the component's inputs, outputs, and derived state. It also expands the existing blocked-state check without changing its condition or emitted event.

## Verification

- The second formatter pass produced no additional source changes. The formatting check and `git diff --check` passed.
- `pnpm testNoWatch` passed 413 tests, with two opt-in tests skipped.
- Baseline and final production builds passed using `pnpm exec ng build --configuration production --stats-json`. The emitted JavaScript assets matched. The global stylesheet changed only in hexadecimal color casing. Component-style warnings stayed at 7,147 bytes for TaskRow and 4,308 bytes for AppSidebar. Both remain below the 8,000-byte error threshold.
- No new tests were needed for the formatting or scheduler presentation cleanup. Existing scheduler tests ran with the full suite. Browser and physical-device checks were outside this pass.

## Deferred

Keep store and page method boundaries, field initialization order, and template expression extraction for separately reviewed changes if a concrete need arises. Larger naming changes and comments that need validation against current behavior were left for focused follow-ups. The educational documentation pass has yet to begin.

# Settled Decisions and Reasoning — Life Is Too Short

*Last reviewed: November 8, 2026*

These decisions represent agreed architectural and product directions. They do not necessarily indicate that implementation is complete.

## D01 — Angular, TypeScript, Supabase, and PrimeNG

**Decision:** Continue developing the existing application using Angular, TypeScript, Supabase, and PrimeNG.

The current repository uses Angular 21 and PrimeNG 21.

**Reasoning:** The existing stack builds on established expertise and avoids unnecessary migration costs.

**Avoid:** Rewriting functioning systems without a demonstrated benefit.

## D02 — Smart/presentational separation and signals

**Decision:** Favor Josh Morony's Smart/Dumb component pattern.

- Smart components coordinate application state, business operations, and dependencies.
- Presentational components render information and communicate interactions.
- Signals and computed signals manage synchronous reactive state.
- Promises and RxJS handle asynchronous operations and streams where appropriate.

**Reasoning:** Separating orchestration from presentation improves testability, reuse, and maintainability.

**Avoid:** Excessive business logic in templates, duplicated state, and unnecessary BehaviorSubjects.

## D03 — Modular monolith architecture

**Decision:** Maintain one application with clearly separated feature domains until real requirements justify greater architectural complexity.

**Reasoning:** A modular monolith supports incremental development and manageable maintenance costs.

**Avoid:** Premature microservices and a universal data model that combines unrelated domains.

## D04 — Invitation-only beta

**Decision:** Restrict onboarding to trusted invited users before expanding beyond the current beta.

**Reasoning:** Limits security exposure, abuse, and infrastructure costs while the product matures.

**Avoid:** Public account registration before authorization and cost protections are validated.

**Implementation status:** Not confirmed complete.

## D05 — Database-enforced authorization

**Decision:** Authorization must be enforced through Supabase RLS, appropriate database constraints, and secure server-side functions.

**Reasoning:** Angular guards and UI restrictions cannot protect database resources from independently crafted requests.

**Avoid:** Treating frontend restrictions as security boundaries or exposing privileged service-role credentials.

## D06 — Conventional cloud security for the initial beta

**Decision:** Use established transport encryption, at-rest encryption, authentication, and authorization.

Do not introduce end-to-end encryption into the initial beta.

**Reasoning:** This approach supports server-side search, filtering, troubleshooting, and practical development.

Communications must disclose that privileged administrators can technically access user content.

**Avoid:** Claiming zero-knowledge confidentiality or administrator-inaccessible data.

## D07 — User data ownership

**Decision:** Preserve the long-term ability for users to export and meaningfully recover their information.

**Reasoning:** Users should not be forced to maintain subscriptions simply to retain access to personal information.

**Avoid:** Coercive lock-in and surprise changes to data access.

**Timing:** Export/import functionality is not an immediate beta requirement.

## D08 — Separate due dates and planned dates

**Decision:** Maintain a conceptual and data-model distinction between:

- Due dates: deadlines
- Planned dates: days the user intends to work
- Scheduled time blocks: specific periods reserved for work

**Reasoning:** These represent different scheduling obligations.

**Avoid:** Using one date field to represent incompatible concepts.

## D09 — Separate recurrence, completion history, and goals

**Decision:** Future recurring tasks and habits must distinguish expected activity, actual history, and desired targets.

**Reasoning:** Scheduling rules and historical outcomes are different kinds of information.

**Avoid:** Overwriting historical activity when generating the next recurrence.

## D10 — Agreed development sequence

**Decision:** Prioritize reliable core functionality, security, styling, scheduling, and initial quality-of-life improvements before introducing additional domains.

The agreed later sequence is:

1. Recurring tasks
2. Second UI/UX redesign and polish
3. Habit Tracker
4. Calendar versus whiteboard planning evaluation
5. Broader invited beta when ready
6. More advanced features based on usage

Some scheduling and interface work already exists on `main`; validate rather than rebuild it.

## D11 — Security and quality are continuous obligations

**Decision:** Testing, migration discipline, backups, accessibility, performance, and security are continuous workstreams.

**Reasoning:** Deferring foundational engineering work creates reliability risks and expensive future corrections.

## D12 — Incremental custom component library

**Decision:** Eventually explore replacing PrimeNG with a reusable custom Angular component library.

**Reasoning:** Greater control over reusable components and design consistency may provide long-term value.

**Timing:** Roughly six months or later is an aspiration, not a binding deadline.

**Avoid:** A high-risk, wholesale component-library rewrite.

## D13 — Sustainable support commitments

**Decision:** Establish realistic support expectations compatible with solo development.

Prioritize security, outages, and data loss ahead of minor defects and feature requests.

**Reasoning:** Support commitments should reflect available capacity.

**Avoid:** Promising 24/7 support or charging users without operational readiness.

## D14 — Separate business domains in the future suite

**Decision:** Tasks, habits, travel, fitness, and calendar features should retain distinct domain ownership while sharing account infrastructure and reusable UI where appropriate.

**Reasoning:** Preserves extensibility and prevents inappropriate data coupling.

**Avoid:** Forcing fundamentally different concepts into the task schema.

## D15 — Planned intent versus due obligations in Today

**Decision:** Due dates represent obligations, while planned dates represent intended work. Today can show planned-today tasks and due-only unplanned tasks. Overdue work stays identifiable even when deliberately planned for a future day.

## D16 — Atomic task-content editing

**Decision:** Edit task title and Markdown description in one session and persist both atomically. Preserve safe Markdown rendering and avoid accidental draft loss.

## D17 — Responsive cards versus mobile drag

**Decision:** Task cards respond to container width independently of the mobile viewport. Desktop cards (including compact ones) support CDK drag, while mobile layout (<768px) disables task drag and removes its handle/gutter to support touch scrolling.

## D18 — Project navigation and actions

**Decision:** Project names navigate and a distinct chevron expands/collapses nested children. Project Edit/Delete must remain accessible through action menus that reuse existing dialogs and store operations.

**Status:** PR #61 is merged, with name → optional chevron → More actions ordering. Project-page More actions is implemented separately on `codex/project-page-actions`, pending review and merge; it reuses the existing AppShell dialogs through a shell-scoped request coordinator.

## D19 — Shell and privilege distinction

**Decision:** Desktop/mobile share one sidebar, mobile uses a drawer and desktop offers a collapsible navigation rail. Account appearance and logout are grouped under the sidebar account popover. Realtime status is an optional development-mode diagnostic—not an admin role.

## D20 — Project sections are not child projects

**Decision:** Preserve distinct concepts. Nested child projects are separate navigable projects; sections would group tasks *inside* a project.

**Status:** Section behavior and data modeling remain exploratory, not authorized implementation.

## Not settled decisions

The following remain open:

- Exact usage and rate-limit thresholds
- Whether habits belong in the task domain
- Calendar versus whiteboard priority
- Checklist versus nested-task design
- Project archiving, duplication, and recurrence semantics
- Monetization and pricing
- Self-hosting support
- Client-side encryption

Codex should not treat these as finalized requirements.

## D15 — Visual design ownership, hierarchy, and component-local styling

**Decision:** Develop an intentional, distinctive UI guided by "minimalism in complexity, not minimalism in personality." Prioritize discoverable affordances, meaningful visual hierarchy, and consistency over either featureless gray minimalism or excessive decoration.

Use **primitive -> semantic -> component-level** design tokens. Shared colors, text, surfaces, interaction-state meaning, and genuinely reused styling belong in global styles; unique component appearance and layout remain in the corresponding component SCSS. Component-local tokens are appropriate when not broadly shared.

**Decision:** The app owns its semantic style vocabulary; PrimeNG should be adapted to the chosen appearance during the gradual transition to a custom component library. Do not make PrimeNG's default visual tokens the permanent source of truth.

**Decision:** Use hexadecimal color syntax by default, with 8-digit hex, RGBA, or token-derived `color-mix()` where opacity or composability warrants it.

**Reasoning:** A consistent visual language teaches the user how to interact, like visual signposting in video games. Modest, purposeful depth and contrast can make a button read as a button without making every control ornamental.

**Avoid:** Duplicated literal hex colors in components; overloading global CSS with one-off component styles; removing affordances in the name of minimalism; indiscriminate shadows, outlines, and gradients.

**Timing:** Select a palette before the dedicated contrast-adjustment pass. Dark mode is a medium-term goal; do not claim the palette is production-ready until accessibility is validated. Further details: [Visual Design Principles](visual_design_principles.md).

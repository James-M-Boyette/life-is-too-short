# Mobile application shell verification

The branch starts from `origin/main` at `468cd90`, after PR #55 merged.

## Implementation and tradeoffs

- The shell uses CDK BreakpointObserver with `(width < 768px)`. CSS uses the same exclusive boundary. At 768px and above, the desktop grid and persisted-in-session sidebar width remain intact. Below it, the main area occupies one grid column and the resize separator is hidden.
- PrimeNG Drawer supplies the left overlay, translucent dismissible backdrop, Escape handling, scroll blocking and focus trap. It is approximately 80vw, capped at 20rem (320px), with dynamic viewport height and safe-area padding. PrimeNG pass-through attributes provide a named modal dialog. The background shell is inert while navigation is open.
- A CDK DOM portal relocates one existing sidebar element into the drawer, returning it to the hidden desktop location on dismissal. The AppSidebar instance and its local expandedProjectIds are retained. Interaction tests check identity, expansion and live project-input updates after relocation. There is no separate mobile project tree or expansion store.
- The small AccountControlsComponent isolates the existing palette/email/sign-out controls for reuse in the desktop top bar and mobile navigation. It uses the same theme service and sign-out output. Palette selection is never duplicated into local shell state.
- Mobile top bar offers Navigation, restrained identity and Add Task through the existing contextual creation workflow. Task/page headings and error feedback remain. Drawer closes for links (including the current route), successful router navigation, task/project dialogs and responsive transitions. Dismissal restores focus to a visible control without taking it away from newly opened dialogs.
- Task and project modal cancellation restores mobile focus. The existing Add Task footer gets a mobile-only wrapping rule after browser testing revealed clipped controls. Its form, persistence and desktop layout are unchanged.
- No task-row, editor, scheduler, ordering, store, database, Today board or Upcoming board behavior changed. Desktop top-bar functionality and sidebar keyboard resizing remain available.

## Automated verification

- `node node_modules/@angular/cli/bin/ng.js test --watch=false`: **214 tests pass, 18 files**.
- Six focused shell interaction tests replace the previous creation smoke test. They cover open/close/backdrop/Escape/focus, all navigation links including the current route, programmatic navigation, single sidebar identity and expansion across transitions, reactive project-tree updates, keyboard resizing, contextual task creation/cancellation, palette/sign-out, and Create/Edit/Delete project dialog entry and cancellation. Existing five sidebar tests retain chevron/double-click/CRUD-output coverage.
- Existing task creation tests and all task-card, scheduling, ordering, rollback and security-input tests remain passing. No CSS snapshot suite was added.
- PrimeNG's CSS mask leave animation is completed explicitly in JSDOM; native key events populate the legacy `which` field used by its Escape listener. Real browser tests complement these synthetic interactions.
- Test output includes existing reactive-form disabled-attribute warnings from the task creation component. Those controls were not refactored in this shell change.
- `git diff --check`: passes.
- `node node_modules/@angular/cli/bin/ng.js build --configuration development`: passes.

## Production-build blocker inherited from main

`node node_modules/@angular/cli/bin/ng.js build --configuration production` was run and **fails the existing task-row SCSS size budget**: 8.11kB against an 8kB error threshold (105 bytes over). Its 4kB warning and the sidebar warning (now 4.39kB) are also reported. There are no TypeScript or Angular template compilation errors.

The task-row stylesheet is untouched: both the working file hash and `origin/main:src/app/features/tasks/components/task-row/task-row.component.scss` are `7fe4fb8e3325f6e1946aca061fee98a69c199697`. No budgets were increased and no unrelated task-card CSS was changed to mask this baseline problem. This must be resolved before deployment.

## Browser verification

Checks used the real AppShell, TopBar, AppSidebar, TasksPage and task components in the ignored local acceptance workspace, with synthetic projects/tasks and mocked stores. No production data or backend mutations were used.

- 375px: full-width main, compact top bar/cards, no body horizontal overflow; drawer approximately 300px wide and viewport-height.
- 390px: full-width main, drawer approximately 312px wide, keyboard opening/closing, focus trap from Close navigation backward to Sign Out and forward back to Close navigation; long project navigation scrolls independently. Account controls remain reachable. Add Task modal has equal content scroll/client widths after the footer wraps, with planned date defaulting to today; cancellation restores focus to top-bar Add Task.
- 430px: drawer width capped at 320px and height follows a 932px viewport. Backdrop dismissal restores focus to Navigation. Expanded child projects survive navigation to their parent and reopening.
- 767px / 768px: mobile below the boundary; desktop at 768px. Resizing an open drawer to desktop closes it, restores the same sidebar, removes background inertness and focuses a visible navigation link. Fractional viewport widths use the same exclusive CSS/JS boundary.
- Desktop (1280px requested): account controls and permanent sidebar remain; ArrowRight on separator changes width from 260px to 270px, with the same expanded child present and no drawer mask remaining.
- Real-browser Escape dismissal works on repeated open/close. Responsive checks and dynamic viewport sizing here were performed in Chromium, not Safari.

## Remaining acceptance

Physical iPhone/Safari checks remain for safe-area insets, browser chrome expanding/collapsing, on-screen keyboard, touch scrolling/taps and VoiceOver. Also verify ordinary authenticated workflows against a disposable development account; browser checks above used synthetic stores and did not submit task/project mutations. Today Planning and Upcoming retain their existing board layouts and are deliberately deferred from this shell PR.

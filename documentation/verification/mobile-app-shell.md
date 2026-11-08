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

## Production build — resolved after main integration

The initial mobile implementation inherited main's 8.11kB TaskRow stylesheet, exceeding its existing 8kB error threshold. PR #57 resolved that independently. Latest main (`6e5e60b`) has now been merged into this branch without conflicts, preserving the completed mobile implementation.

`pnpm exec ng build --configuration production` now **passes**. TaskRow is 7.49kB; the sidebar is 4.36kB. Both still exceed the 4kB warning threshold, but neither exceeds the unchanged 8kB error threshold. This follow-up does not alter TaskRow styles or budgets.

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

## Navigation background follow-up

The desktop grid stretches `.desktop-navigation` to the available shell height, but only its content-sized `.sidebar-navigation` previously painted the sidebar color. The new wrapper/portal relationship also left a chain of percentage heights that could push mobile account controls below an unnecessarily full-height navigation block.

The full-height desktop wrapper and body-appended drawer now own the sidebar background. The relocated `aside.app-sidebar` has a border-box minimum height of 100% of its available navigation surface and can grow with content. The sidebar component and inner nav use their natural content height. Only the desktop wrapper or PrimeNG drawer content owns vertical scrolling. No arbitrary 100vh overrides or extra portal instances were introduced.

Real Chromium measurements with synthetic data and real components:

- Desktop, 1280×900 requested: short navigation, aside and shell all end at y=908. The navigation surface is 836px high while tall main content scrolls through 3239px. With an empty Inbox main view, the same surface still reaches the shell bottom.
- Long desktop project tree: wrapper scrollHeight 1372px versus clientHeight 836px. Scrolling navigation to 536.8px leaves main scrollTop at 0. ArrowRight resizing still changes width to 270px.
- Mobile 390×844: short navigation has content scrollHeight equal to clientHeight (759px), so no unnecessary scroll. The account area ends at y=736.4 with the same sidebar surface continuing below it. Long navigation has scrollHeight 1916px and independently scrolls to Sign Out; Shift+Tab/Tab remains trapped within the drawer.
- Desktop, aside and drawer backgrounds resolve to the same semantic sidebar color (`rgb(234, 242, 241)` in Maritime & Coral). There is one sidebar instance; expanded child projects survive the mobile-to-desktop portal transition. Background inertness is removed on that transition.

Final integration checks: `pnpm exec ng test --watch=false` passes all 214 tests across 18 files; production build and `git diff --check` pass. No new CSS-only tests were added: existing navigation/portal interaction coverage and actual browser geometry checks cover this presentation correction.

### Deferred design guidance

Keep current account controls and the application top bar in this PR. The conceptual desktop/mobile screenshots guide hierarchy, not literal styling: persistent desktop navigation; minimal mobile navigation/Add Task controls with the page title beneath. Superseded by the account-navigation redesign: show one initials avatar in the trigger and none inside the popover. `pi pi-chart-line` is reserved for a future Analytics feature; do not add a placeholder item. Names and initials in the reference are illustrative, not assumed authentication data. That redesign is deferred to a separate PR.

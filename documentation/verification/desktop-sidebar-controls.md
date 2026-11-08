# Desktop sidebar controls and development diagnostics — 2026-11-07

Branched from latest main `5888943`, including the merged account-navigation redesign and global body-margin correction.

## Implementation

AppShell owns one in-memory desktopCollapsed signal, independent of the existing sidebarWidth. The grid derives its columns from those signals and the existing 768px mobile breakpoint. Expanded desktop retains its original sidebar/resizer columns. Collapsed desktop uses a 4rem (64px) rail with a visible Expand button and accessible Inbox, Today and Upcoming links. Controls are 44px targets with labels, tooltips, focus rings and active-route indication.

The existing aside, account component and AppSidebarComponent are not recreated. Collapsed desktop sets hidden and inert on the full aside and hides the resize separator with tabindex=-1. It also dismisses any open account popover. Therefore hidden project/account controls do not remain keyboard-accessible, and there is no second project tree. The rail contains only three static route links, not project navigation logic or a second sidebar component.

Expanding restores the last width and project expansion state. The existing keyboard/pointer resize code is retained, with guards for mobile/collapsed mode. Collapse/expand moves focus to the newly visible counterpart. The full mobile drawer ignores the desktop collapse flag while retaining that flag for the next desktop transition. Breakpoint focus restoration handles the rail, full sidebar, account panel and disappearing mobile top-bar controls. The CDK DOM portal remains unchanged.

Collapse state and width remain in the shell's memory through ordinary task routing and responsive transitions. No preferences, localStorage, sessionStorage or database persistence were added; a reload or destruction of the shell resets the in-memory state.

TasksHeaderComponent locally captures Angular isDevMode() for the routine Realtime on/off label. User-facing errorText stays outside that conditional, and realtime/store/connection logic is untouched. This is a temporary display policy, not an authorization decision or a developer/admin role. Future privileged features must use trustworthy server/database-controlled authorization, never client flags or user-editable Auth metadata. No roles, profile tables, migrations, RLS or permissions were introduced.

## Automated verification

- Targeted shell/header tests: **12 pass**.
- `pnpm exec ng test --watch=false`: **229 tests pass across 20 files**.
- `pnpm exec ng build --configuration production`: **passes**.
- `git diff --check`: **passes**.
- Existing style warnings remain TaskRow 7.49kB and sidebar 4.36kB against the 4kB warning threshold; error limits were not raised. No new component-style warning.

Three new shell interaction tests cover collapse/expand, retained width/component identity/project state, hidden/inert/tabindex contracts, focus restoration, rail routes/current-page indicators and breakpoint/drawer transitions. They also cover returning to desktop while the closed mobile toggle has focus. Existing task creation, account-menu/logout and project dialog tests remain intact. The header smoke test was replaced with two meaningful mode cases using Angular's real isDevMode() result, verifying both routine on/off status and visible errors. Existing task/store/scheduling/ordering tests were retained.

## Actual browser verification

Used real components and synthetic stores in the ignored local acceptance workspace. No production data or backend mutations were used.

- At 1280×900, keyboard resizing from 260px to 270px and pointer resizing to 310px worked. Collapse produced a 64px rail and 1216px main grid track. Expanding restored 310px and expanded child projects, with one sidebar and account instance throughout.
- Real Enter activation collapses/expands the sidebar. After collapsing, focus is on Expand; Tab visits Inbox, Today, Upcoming, then main Add Task. No hidden sidebar descendant receives focus. The aside computes to display:none and inert; the separator is tabindex=-1.
- Today navigation from the rail updates the page and aria-current without expanding the sidebar. Expanded account and collapse touch targets do not overlap.
- Switching collapsed desktop to 390px mobile removes the rail, reveals the full sidebar inside the drawer, retains expanded children and account access, and restores focus to Show navigation. Returning to desktop from an open drawer restores the collapsed rail and Expand focus. Expanding again restores 310px. The closed-toggle transition is additionally protected by the component test.
- Long tasks and long project navigation scroll independently (sample main scrollTop 1800px and navigation 528px), while document scrollTop remains 0. Document/viewport height remains 900px; the navigation surface stays continuous.
- The development fixture displays Realtime: off and a synthetic synchronization error.
- A separate optimized Angular fixture build of the same real components was loaded from a local static server. Its DOM has zero diagnostic status nodes, while the synthetic synchronization error is visible both expanded and collapsed. This confirms optimized production behavior in addition to unit mode checks and the application's production build. The temporary static server was stopped after verification.

The local acceptance workspace and generated bundles remain ignored and are not part of the PR. The optimized fixture is a verification artifact, not a new application service or environment system.

## Remaining acceptance

Physical Safari/iPhone, VoiceOver and touch behavior still require device verification. Chromium and synthetic-store tests do not establish physical-device behavior or live backend connectivity. No realtime connectivity behavior, account permissions or task-board layout was changed in this work.

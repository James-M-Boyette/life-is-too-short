# Project sidebar navigation and actions

## Responsibilities

AppSidebar preserves the existing name-link navigation, separate expansion chevrons, ancestor expansion, and signal-backed nested tree state. It owns one PrimeNG popup Menu for every project row and emits Edit/Delete project IDs. AppShell binds those outputs to its existing modal orchestration. ProjectsStore and project CRUD/deletion semantics are unchanged.

The action slot has stable width: desktop icons appear on hover/focus, while mobile/coarse-pointer controls remain visible with a 44px target. Long names truncate. Delete uses item-local semantic danger tokens, including focused/hover backgrounds, so styling follows the overlay without global overrides.

The popup appends to body on desktop and to the existing Drawer root on mobile, outside scrolling navigation and inside its focus/stacking context. A menu-local Escape listener dismisses the popup and restores trigger focus without closing the drawer. Other menu keyboard handling stays with PrimeNG. The listener is cleaned up on dismissal/destruction. Opening another row waits for the same popup's leave lifecycle before reopening with the new context. Availability/breakpoint changes and removal of the selected project dismiss safely; action commands revalidate the project ID.

## Automated verification

- Targeted sidebar/shell tests: 24 passed.
- Full suite: 244 tests passed across 20 files.
- Production build: passed.
- git diff --check: passed.
- Stylesheet warnings remain below the 8kB error budget: AppSidebar 4.31kB; TaskRow 7.62kB. No budget changes.
- Existing AppShell reactive-form disabled-attribute advisories and JSDOM modified-link navigation notices remain.

Tests replace the obsolete assertion that sidebar CRUD controls are absent with meaningful action coverage: separate navigation/toggle/menu intentions, nested tree and ancestor behavior, Edit/Delete outputs, one menu, context switching, keyboard activation, Escape propagation/focus, selected-project removal, and real sidebar-to-shell dialog integration. Existing rail, portal, resizing, mobile navigation, creation, and account tests remain intact.

## Browser acceptance

Used real components in the ignored local acceptance workspace, with synthetic project/task/auth stores and no backend mutations. Checked desktop at the normal browser width and 1280px, and mobile at 390px:

- Name links, separate chevrons, and four nested project levels remain distinct; expanding does not navigate.
- One sidebar and one menu remain present while switching selected projects. Editing after switching correctly opened Project 1's existing form.
- Enter opens the menu; Escape returns focus to More actions. On mobile, the drawer remains open.
- Menu is inside the Drawer focus context and fits in the viewport; mobile action buttons measure 44px square.
- Edit opens the prefilled existing project editor and closes the drawer. Delete opens the existing confirmation and closes the drawer. Both were cancelled; no persistence was invoked.
- Outside clicks dismiss the popup.
- A long project label measured 522px of text in 144px of available space, with ellipsis and no sidebar horizontal overflow.
- Collapsing/reopening the desktop rail preserves nested expansion and makes hidden navigation inert.

Physical touchscreen/screen-reader combinations and mobile Safari remain device acceptance checks. No project-page menu or Sections functionality was added.

## Self-review

Reviewed stale selected IDs, popup switching/animation races, focus handoff into modals, Escape bubbling into the drawer, stable action-slot layout, and overlay-scoped destructive styling. No new data operations, security boundaries, services, stores, or duplicate project trees were introduced. The existing arbitrary-depth hierarchy/expansion implementation was retained.

## Pre-merge correction

Project controls now follow DOM/Tab order: name, optional expansion chevron, More actions. Leaf rows contain no chevron placeholder. Existing flex sizing and action visibility rules are unchanged. Added one focused order regression covering parent, nested parent, and leaf rows. Restored only dockerStart and localStart to origin/main values; package.json now has no diff against main. Re-ran targeted/full tests, production build, and diff check successfully. Browser acceptance above predates this template-only reorder; no new browser session was required for the unchanged interaction handlers/styles.

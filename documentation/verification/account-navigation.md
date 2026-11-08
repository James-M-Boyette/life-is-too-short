# Account navigation redesign — 2026-11-07

Started from latest main `25fed57`, confirming the merged mobile shell, single-sidebar CDK portal, continuous navigation background and TaskRow CSS hotfix were present.

## Components and responsibilities

- AccountControlsComponent now renders the shared account trigger and PrimeNG Popover. Local signals own Appearance disclosure, open state and the overlay parent. It still delegates palette changes to ThemePaletteService with PALETTE_OPTIONS and emits sign-out intent.
- A small pure accountIdentity function derives presentation data from supplied Auth metadata. It adds no profile model, service, store or database requirement.
- AppShell renders exactly one account component at the top of the existing sidebar element, before AppSidebar. CDK relocates that whole element into the drawer; account and project state are not duplicated. AppSidebar's navigation/project logic is untouched.
- TopBarComponent retains its existing files but is simplified to mobile-only Navigation and Add Task actions. Desktop has no application top bar and uses the reclaimed height; TasksHeader headings remain unchanged. Login branding and browser title are unchanged.
- The former bottom-of-drawer Account & Appearance section is removed. No avatar, decorative badge, Analytics item or chart icon appears inside the account popover. There is one avatar in the trigger.
- AppShell coordinates existing AuthStore.signOut and login navigation. Pending state blocks duplicate requests; failed sign-out stays visible for retry without dismissing the drawer/menu. Error feedback is scoped to the requesting account. AuthStore and Supabase behavior are unchanged.

## Identity rules

Only nonempty string metadata is used; whitespace is normalized for display. Precedence is full_name, first_name/last_name (with given_name/family_name fallbacks), name, then display_name. Values without letters or containing an email-style @ are not treated as real names. Auth metadata is display-only and is never an authorization signal.

A usable multiword name supplies its first word to the trigger, its full value to the popover, and first/last initials. A single name supplies one initial. Without a usable name, the trigger uses the email local part (or Account), the popover displays the email, and the trigger shows a neutral user icon. No real name is inferred from email. All metadata is interpolated as text, not HTML; long names/emails wrap or truncate within their available space.

## Appearance and overlays

Appearance expands a fieldset of native radio choices inside the same popover. Selection immediately calls the existing theme service; persistence and semantic tokens remain unchanged. Native radio arrow-key behavior and normal Tab navigation are retained. Log out is a neutral text/icon action, not a destructive button.

Desktop popovers append to body, outside sidebar scrolling. On mobile, the supported appendTo target is the drawer's outer panel, outside its scrolling content but inside its stacking/focus context. PrimeNG provides positioning, outside-click and scroll/resize dismissal; a local PrimeNG focus trap keeps keyboard navigation within the account panel. Escape is consumed locally to close the account panel without also closing the drawer. Focus returns to the trigger without scrolling the sidebar back to its top, or remains on another outside control when appropriate. Closing navigation or changing responsive/account context dismisses the account popover to avoid orphaned overlays.

The panel width is capped by the viewport, and its internal maximum height reserves space for the anchor/header and safe-area insets. No extra overlay service, custom pointer system or global CSS overrides were introduced. On sidebar scrolling, PrimeNG dismisses the menu rather than maintaining a custom position-tracking system.

## Automated verification

- Focused account identity/menu, shell and top-bar tests: **18 pass**.
- `pnpm exec ng test --watch=false`: **225 tests pass across 20 files**.
- `pnpm exec ng build --configuration production`: **passes**.
- `git diff --check`: **passes**.
- Existing warning thresholds remain: TaskRow 7.49kB / 4kB; sidebar 4.36kB / 4kB. Error budgets were not raised, and the new account stylesheet stays below its warning threshold.

New focused tests cover name and email fallbacks, whitespace/malformed metadata, international and long names, text-safe rendering of untrusted identity strings, mouse/keyboard toggling, one trigger avatar and no popover avatar, Appearance selection, outside dismissal, Escape/focus, context/account changes, sign-out output, pending/error feedback, failed logout retry and duplicate prevention. Existing shell tests were updated for shared account placement, inline appearance, no desktop header, mobile drawer integration, contextual task creation and resizing. Existing task/project/scheduling tests were retained.

Test output still includes the existing reactive-form disabled-attribute warnings from task creation; no unrelated form refactor was made.

## Actual browser checks

Used the real shell/sidebar/tasks-page components with synthetic Auth/project/task stores in the ignored local acceptance workspace. No production data, credentials or backend writes were used.

- Desktop (1280px requested): no top bar, page heading retains the main-content padding (outer body gutter removed in the follow-up below), one account instance and avatar, first-name trigger and full-name/email popover. Popup contains no avatar. Continuous sidebar background remains.
- Mobile 375×812: expanded Appearance popup is 304px wide and within the viewport. It is a child of the drawer root, visually above the drawer/backdrop, not clipped by scrolling navigation. Keyboard Tab/Down selects a palette immediately. Escape closes only the account panel and restores trigger focus; the drawer stays open.
- Mobile 320×568, intentionally long identity: body width remains 320px. Popup bounds approximately x=2.4–290.4 and y=154.8–556.4. The panel scrolls internally (376px client / 642px content), and no horizontal identity overflow occurs. Shift+Tab reaches Log out; Tab wraps to Appearance within the panel.
- Mobile 390px: email-only accounts show a local-part trigger and neutral avatar. Outside-clicking the drawer header dismisses only the account menu; clicking the backdrop closes both and restores Navigation focus. Long project expansion survives responsive relocation.
- Mobile 430px: top bar contains exactly two controls and no identity/app-name text. The account popup fits and has zero avatars inside it.
- Tablet 768px / 1024px: desktop presentation applies, open account menus dismiss on transition, one account instance remains, the desktop sidebar returns and background inertness clears. ArrowRight resizing still reaches 270px and there is one main page heading.
- Long desktop project navigation scrolls independently to 544.8px while main scrollTop remains 0. PrimeNG scroll dismissal removes the popup; restoring focus does not reset sidebar scrolling. The semantic navigation background stays continuous.
- Logout through the synthetic AuthStore reached the isolated login route. This verifies wiring/navigation, not real Supabase logout integration.

## Remaining acceptance

Physical iPhone/Safari checks remain for VoiceOver, touch taps/scrolling, safe-area/browser-chrome behavior and viewport changes. Chromium tests cannot establish those behaviors. Verify ordinary real-auth sign-out and palette persistence in a disposable development session before deployment; no production account was used for automated verification. No account-management or Analytics functionality was introduced.

## Follow-up: global body margin reset

The body margin reset now applies globally rather than only below 768px. The desktop shell uses 100dvh; the browser's default 8px body margin previously added an outer gutter and document overflow. No overflow suppression, sidebar collapse, role changes or diagnostics were introduced. Shell/main/navigation sizing and overflow rules are unchanged.

Verification in an isolated standards-mode browser fixture (CSS1Compat, matching production's doctype), with real shell/login components and synthetic stores:

- Desktop 1280×900: shell bounds are exactly (0,0)–(1280,900); document scrollHeight and viewport clientHeight are both 900px. Long tasks scroll inside main (sample scrollTop 900px), and long projects scroll inside navigation (502.4px), while document scrollTop remains 0.
- Normal body overflow remains visible. PrimeNG Add Task applies its own temporary p-overflow-hidden class / hidden overflow during the modal, then removes the class and restores visible overflow after Cancel. Margin remains 0 throughout and no document scrollbar is introduced.
- Mobile 390×844: shell/drawer fit the viewport, margin stays 0, drawer scroll locking applies and clears after Escape, and focus returns to Show navigation.
- Real LoginPage was checked at desktop and mobile widths without submitting credentials. On a short 375×430 viewport, the page retains normal document scrolling (approximately 534px content, 103px sampled scroll), visible overflow and no horizontal overflow. No drawer/dialog masks remain after navigation to login.

Relevant shell/account tests: 13 pass. Full suite: 225 tests across 20 files pass. Production build and git diff --check pass; the existing TaskRow 7.49kB and sidebar 4.36kB warning thresholds remain unchanged. No new tests were added for this CSS-only reset: existing overlay interactions and real-browser layout measurements provide proportionate verification. Physical-device/Safari acceptance remains as listed above.

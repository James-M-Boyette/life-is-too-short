# Responsive task-card acceptance

The card itself (`li.row`) is the named `task-card` inline-size container. Compact mode starts below 32rem of **content width**, excluding card padding/border. The threshold reserves roughly 18rem for a readable title after the expanded card's leading controls and three actions. It is independent of the viewport and board layout.

The default global CDK clone retains this container, its matched outer width, and Angular content attributes. There is no separate preview template. Container queries style descendants so the same breakpoint applies to the original and floating preview.

## Automated scope

Component tests cover explicit Planned/Due entry, switching an already-open scheduler without writes, date-control focus restoration, overdue labels, missing description/date states, project and Inbox links, the original TreeSelect reached through Move to project, shared project-change output, preview container/metadata structure, compact-preview editing, and focus fallback if Pencil becomes hidden. Existing editor, Markdown safety, scheduling, ordering, rollback, and drag/drop tests remain in use.

JSDOM does not evaluate container-query layout or pointer dragging. CSS assertions and synthetic event tests do not establish actual sizing, clipping, touch behavior, or screen-reader output.

## Verification results

- Full Angular/Vitest suite: 207 tests passed across 18 files (`node node_modules/@angular/cli/bin/ng.js test --watch=false`).
- Production build: passed (`node node_modules/@angular/cli/bin/ng.js build --configuration production`).
- Existing sidebar stylesheet budget warning remains; task-row styling now also warns at 7.08kB against the 4kB warning threshold. Error budgets were not increased.
- No database, store mutation, grouping, board layout, or ordering changes.

## Real-browser checks — pending

Use disposable test tasks; do not use automated tests against production data.

| Card content width | Normal presentation | Editing | Scheduling/project selection | Dragging |
| --- | --- | --- | --- | --- |
| 240–280px | Compact, 2–3-line title, 1–2-line plain preview, dates then project; no overflow | One existing editor, wrapping title/actions, one bottom Save/Cancel pair | Planned and Due open their own tabs; no-date Schedule remains visible; Move to project opens original selector | Same compact mode and width in global preview |
| 360–420px | Same compact hierarchy; safe long-word/project truncation | Drafts survive resizing and failures | Both dates/overdue indicator readable; overlays stay on-screen | Card border/background/metadata/elevation retained |
| Just below/above 32rem content width | Compact/expanded transition, no duplicate visible actions | No draft reset at threshold | Focus returns to a visible control after resizing | No breakpoint jump when preview is lifted |
| 640–800px | Existing expanded controls, project TreeSelect and metadata | Existing help, Save/Cancel, Enter/Ctrl+Enter/Escape behavior | Existing wide reassignment, clear-to-Inbox, and date selection | Existing expanded preview |

Also check:

- Today Focus, narrow Today Planning columns, Inbox, project pages, and Upcoming, without changing board layouts.
- No description; short/long Markdown with links; full description disclosure; selected text; no dates; only Planned; only Due; both dates; overdue Due; completed tasks.
- Very long unbroken task/project names, nested project names, missing/loading project names.
- Reordering within Today, Due-only → Planned at a specific position, Today/Unscheduled/Overdue cross-column scheduling, and Upcoming date-to-date drops. Check near scrolling boundaries.
- Keyboard/touch access to required controls without hover, focus rings, menu dismissal, TreeSelect selection/clear/cancel, and scheduler focus after task movement.
- Short previews expose no clipped focusable Markdown links; expand reveals formatted content and links independently of editing.
- Phone-sized viewport and wide viewport with a narrow sidebar/column: mode follows card width, not device width.


## Card-surface dragging follow-up

Expanded cards retain the hamburger drag affordance; compact cards hide it to recover title width. CDK itself now listens on the card root without a registered-handle restriction (CSS-hidden handles would otherwise still block compact dragging). The wide hamburger and blank card surface reach that same CDK listener.

A small listener on the content wrapper stops mouse/touch starts from reaching CDK for buttons, links, input fields, TreeSelect, and the whole rendered-description region. It does **not** call preventDefault, suppress clicks, measure movement, or track pointers. Titles and descriptions remain click/edit and text-selection regions; dragging intentionally starts from blank card space or the wide handle, not from those controls. Required non-drag scheduling and project-move actions remain available.

Mouse drag starts keep CDK's normal movement threshold and no added delay. Touch starts use CDK's 200ms hold delay: movement before that delay cancels the pending drag so a swipe can scroll. Touch behavior is not established by JSDOM and needs device/browser acceptance. Native text selection remains available before a drag; CDK owns selection suppression during an active drag.

The global preview alone uses independent `rotate: 1.5deg` and slightly stronger elevation; CDK continues owning `transform`. The original cloned placeholder remains in layout with a soft surface/dashed border and hidden (not removed) contents. No custom preview/placeholder templates, explicit height measurements, or store changes were added.

Additional real-browser acceptance — pending:

- Expanded: wide handle and blank surface drag; compact: no visible handle, blank surface drag. Confirm pointer movement on completion, title, description, Markdown links, disclosure, dates, project links/selector, More actions, and editor inputs never starts a card drag.
- A click without movement activates normally; selecting/copying Markdown text still works. Keyboard navigation, editing, scheduling, and Move to project remain usable.
- On touch devices, swipe to scroll before the hold delay; hold then drag from a surface region. Check that the delay feels deliberate without blocking scrolling or taps.
- Preview keeps original width and responsive layout while tilted. Placeholder is empty, softly shaded, and the same measured height/spacing as the source at multiple widths, including long descriptions. Check scroll boundaries and insertion animation.
- Repeat Today same-section reordering, exact Due-only → Planned insertion, allowed/disallowed subgroup transitions, Today/Unscheduled/Overdue cross-column moves, Inbox/Project ordering, and Upcoming date moves. Verify due dates and rollback are unchanged.

These checks require real pointer/touch/browser layout; synthetic component events verify only start-event gating, click outputs, disabled state, and cloned markup/style structure.

Follow-up verification: the full 18-file suite passes (207 tests), including existing cross-column/subgroup ordering, exact insertion, scheduling preservation, and rollback tests. Production build passes with the task-row and existing sidebar stylesheet warnings. Browser acceptance remains pending.

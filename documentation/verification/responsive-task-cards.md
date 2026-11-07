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


## Follow-up: consistent insertion boxes and compact editing (2026-11-07)

The accidental `.task-card-acceptance/` workspace/cache tracking has been removed. The entire root directory is now ignored; any remaining local fixture is verification-only and is not part of the application or PR.

### Measured drag-spacing cause and correction

An isolated fixture used the real TaskList/TaskRow components with Today Planned/Due headings, the special planning insertion target, and connected Overdue/Unscheduled lists. No backend or production task data was used.

CDK's single-axis enter strategy inserts a foreign placeholder before a destination drag root inside its `app-task-row` parent, or appends it directly to the drop list. With a boxed row host, two cards inside one host had no flex gap, whereas direct list children had the list's gap. An empty source host could also retain an unwanted flex gap. This is insertion-position-dependent, not a task-source rule.

| Same pointer destination before Today A | Before | After |
| --- | --- | --- |
| Unscheduled → Today | ghost bottom 432px, next card top 432px: 0px gap | ghost bottom 432px, next card top 444px: 12px gap |
| Overdue → Today | same 0px gap with the same entry position | same 12px gap |

`app-task-row` now uses `display: contents`. Its existing `li[cdkDrag]`, foreign placeholders, headings, and planning target participate in the list's one flex layout. The default cloned ghost height remained 205.6px; preview width remained 320px and rotation 1.5deg. During Due-only → Planned sorting, the sampled ghost bottom was 359.2px and adjacent task top 371.6px (approximately 12px), with CDK transforms active. Group headings remain separate non-draggable elements and all drop indices/predicates/mutation code are unchanged. No source-specific margins or new drag implementation were added.

### Compact-only editing

The existing shared 32rem card-container breakpoint controls these rules. At 320px, browser computed styles showed `nowrap` on the editor header, no header calendar, hidden wide TreeSelect, no horizontal overflow, and a separate editing footer below metadata. Save precedes Cancel. At 800px, the existing `wrap` header, calendar, TreeSelect, flex metadata/actions layout, and lack of footer separator remain unchanged.

Compact editing shows the existing disabled date controls as readable metadata, or one Schedule fallback when neither date exists; the generic header calendar is hidden. The project is read-only text during the content draft, matching the existing editing guard against reassignment/navigation discarding unsaved content. Normal compact project navigation/Move to project and wide editing are unchanged. No content-save, scheduling, or database behavior was modified.

These browser checks establish the measured insertion cases and compact/wide editor geometry in an isolated local fixture. Production-integrated board behavior and physical touch-device testing remain manual acceptance items. The Windows-browser URL-verification limitation from the earlier attempt was avoided by using the in-app browser with an explicit localhost URL.


Final follow-up verification: targeted TaskRow/TaskList tests pass (36 tests), and the full suite passes (209 tests across 18 files). Production build passes after consolidating duplicated compact date styling rather than increasing budgets. Current stylesheet warnings are task-row 7.58kB / 4kB and the existing sidebar 4.14kB / 4kB; the 8kB error threshold is unchanged. Git lists zero tracked acceptance-workspace files and the root ignore rule covers its generated caches.

Final compact metadata measurement after consolidation: at 320px the metadata bottom was 505.4px and the separate action footer began at 525.4px. The no-date case exposed exactly one visible Schedule fallback and no date chips. Save/Cancel order remained unchanged. Wide editing was checked again at 800px with its original header/calendar/TreeSelect and inline flex metadata/actions presentation.

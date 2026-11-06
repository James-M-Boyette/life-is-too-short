# Visual Design Principles and Color Direction — Life Is Too Short

*Established: November 5, 2026*
*Status: Design principles settled; final palette and concrete color values NOT selected.*

This document records product and engineering direction for the UI. It does **not** authorize Codex to redesign the application or alter styles without a specific implementation request.

## Product and portfolio goal

Life Is Too Short should be both a genuinely enjoyable daily productivity tool and a strong demonstration of thoughtful UI/UX and front-end engineering.

The guiding principle is **minimalism in complexity, not minimalism in personality**.

Favor:
- Deliberate visual hierarchy, clarity, restraint, warmth, recognizable controls, and distinctive accents.
- Functional, eye-catching design without a featureless "everything gray" aesthetic.
- Familiar physical affordances where helpful: a button should look actionable, a selected view should look selected, and controls should have discoverable hover/focus/pressed states.
- Depth, borders, shadows, gradients, or highlights only when they communicate structure, elevation, interactivity, or state. Do not pile on effects for decoration.
- Clear density and scannability in task-heavy screens.

Avoid both extremes:
- Hyper-minimal interfaces that hide actions, flatten hierarchy, and remove affordances.
- Overdesigned "disco-ball doorknobs" that look exciting but distract from or obscure their function.

## Visual language: learnability and game design

A recurring inspiration is how good video games establish a consistent visual grammar: early encounters teach the player that an accent, shape, material, or animation denotes an interactable object. Later the player recognizes this without explanation.

Apply the same principle to this app:
- Use visual cues consistently across screens and components.
- Make primary actions, secondary actions, destructive actions, selectable destinations, and status information visually distinguishable.
- Reuse icon/shape/label/placement conventions so users learn how the application behaves.
- Use color to **reinforce** meaning, not as the only signal.
- Keep prominent colors scarce enough that they retain attention value.

For tasks, **planned date** (intention) and **due date** (obligation) are conceptually distinct. Overdue is a time-sensitive status; completed is an outcome. Their visual encodings should not collapse into one undifferentiated accent or imply urgency where none exists. Exact colors and component treatments are open design questions.

## Token architecture and ownership

Use **primitive -> semantic -> component-level** design tokens.

1. **Primitive tokens**: base values and color scales (e.g., teal, neutrals, amber, red). These are implementation values, not UI meaning.
2. **Semantic tokens**: roles such as app surface, elevated surface, primary text, secondary text, primary action, selected navigation, focus ring, danger, planned, due, overdue, completed. These convey meaning across components.
3. **Component-level styles/tokens**: styling unique to the task row, scheduler, sidebar, planning board, etc. These map to semantic tokens when expressing shared meaning.

A shared semantic token belongs in global styles; a token needed only by one component may be declared in that component's SCSS.

### Where styles live

- Maintain a centralized root/global token system, currently rooted in `src/styles/_tokens.scss` and loaded by `src/styles.scss`. It may be split into well-named global partials later if it grows; avoid premature fragmentation.
- Put global, genuinely shared styles (design tokens, base typography/reset, universal utility rules where justified) in global style files.
- Put styles unique to a component in that component's own `.scss`, close to where used.
- Prefer semantic CSS custom properties over duplicated hard-coded colors.
- Do not move one-off component rules to root solely to centralize everything.
- Component-level layout values may remain local when sharing them would add no value.

### PrimeNG transition

PrimeNG is a temporary component implementation, not the long-term owner of the app's visual language. The medium-to-long-term goal is an incremental move to a custom reusable Angular component library.

Therefore:
- Prefer app-owned color semantics and CSS variables for custom styling.
- Configure/bridge PrimeNG's preset and component tokens to the app's chosen design language where practical.
- Avoid tightly coupling the application's custom SCSS to PrimeNG's private color naming and default aesthetic.
- Do not rewrite functional PrimeNG components just to achieve token independence now.

## Color notation

Default to **hexadecimal** (`#RRGGBB`) for solid color values; it is the developer's preferred notation and is fully appropriate for a design system.

- Use 8-digit hex (`#RRGGBBAA`) for fixed-alpha values when readable.
- Use `rgba()` when it makes alpha or dynamic channel calculations more convenient; it is not inherently better or worse than hex.
- Consider `color-mix()` for derived tints/transparent interaction states that should follow a changing semantic token.
- Prefer semantic token references over literal color values in individual components.
- Avoid relying on element-level `opacity` when the intention is only to make a background translucent, because opacity affects descendants too.

## Palette direction — exploration, not a decision

The team is actively exploring a balance of:
- A composed, readable, primarily neutral canvas.
- A distinctive, characterful primary accent.
- Restrained supporting/status colors for intention, obligation, overdue states, completed states, destructive actions, and focus.
- Some warmth or visual charm without excessive saturation, gradients, shadows, or outlines.

Early exploratory directions included warm coastal teal, sage/parchment, and cobalt/mist. **None is approved yet**, and example hex values should not be treated as design tokens or final brand choices.

Evaluate palettes in the **real app context**, especially the sidebar, Today view, task rows, planning board, date chips, buttons, and dialogs. Evaluate the same set of states across candidates so decisions are comparative rather than driven by isolated swatches.

A useful palette review looks at:
- Attractive first impression and recognizable personality.
- Calmness during sustained daily use.
- Clear action affordances and hierarchy.
- Consistency of semantic roles across components.
- Background versus foreground balance.
- Feasibility of accessible contrast and light/dark variations.

## Accessibility and dark mode sequencing

- **Palette selection is the current design focus.**
- After choosing the palette, perform a deliberate WCAG contrast audit and tune tokens against the required contrast levels. Do not assume a candidate is production-ready until tested. Accessibility is not waived or deferred indefinitely; serious blockers should not be knowingly introduced.
- Dark mode is a **medium-term goal**, not a constraint requiring full implementation during initial palette exploration. Build semantic token structure so a future dark scheme is straightforward; do not invert colors naively.
- Keyboard focus, state communication, and non-color cues remain continuous usability/accessibility concerns independent of palette selection.

## Scope / change control

This is guidance for future design discussions and scoped Codex tasks. **Do not alter application source, tokens, PrimeNG configuration, or screenshots solely because this document exists.**

When a color direction is selected, propose a small, reviewable token migration and test against representative task views before expanding to every component.

# Visual Palette Preview — implementation notes

*Originated November 6, 2026; updated November 8, 2026*

This is a reversible first styling iteration, **not** a final palette decision or a production accessibility sign-off.

## Current preview

Five palettes are available via **Account → Appearance** in the sidebar account popover: Maritime & Coral, Botanical & Citrus, Indigo & Copper, Mediterranean, and Ink & Marigold. The old top-bar selector is no longer current.

The existing ThemePaletteService persists selection in browser localStorage under `life-is-too-short.palette-preview`; the document root exposes `data-palette`. This is still client-side appearance configuration, not a Supabase preference or an accessibility sign-off.

## Architecture

- `src/styles/_tokens.scss` owns palette primitives and app semantic color contracts.
- Existing variables such as `--text-primary` remain as temporary compatibility aliases.
- Components own their own layout and styles and reference semantic tokens.
- `src/assets/primeng-style-preset.ts` bridges PrimeNG's primary colors to the app's semantic tokens. The eventual custom Angular component library should consume the app tokens directly.
- The visual direction is balanced and restrained, with defined card borders and low-depth shadows. Destructive/danger colors remain stable when palettes switch.
- Light mode is fixed for this experiment. Dark mode remains a medium-term goal.

## Local evaluation checklist

1. Open Inbox, All Tasks, Today (focus and planning modes), Upcoming, and a project.
2. Open Account → Appearance, change palettes and check the app shell, sidebar, task rows, planner columns, date tags, PrimeNG buttons and dialogs.
3. Test task completion, scheduling, drag-and-drop, and the delete confirmation. Check that color hasn't obscured interactions.
4. Check Markdown display and the unified task-content editor at compact and expanded widths.
5. Check narrow/mobile widths, keyboard focus, and system-dark-mode behavior.
6. Run `pnpm install --frozen-lockfile`, `pnpm run build`, and `pnpm run testNoWatch`.

Do not treat successful compilation as a complete visual or WCAG audit. Contrast and dark palettes need a follow-up design pass.

## Integration note

The original theme and Markdown branches have already merged. The account popover now owns palette selection UI, and ThemePaletteService owns appearance state/persistence. The older merge instructions are historical rather than pending work.

## Design language

- High emphasis: primary task-forward action; usually a filled brand treatment.
- Medium emphasis: supporting operations; often toned/outlined.
- Low emphasis: supporting detail and supplementary actions.
- Conditional status: danger, error, overdue, completion. These are based on meaning rather than simply primary/secondary priority.
- Color is never the only indicator of status. Use icon, label, and visual placement consistently.

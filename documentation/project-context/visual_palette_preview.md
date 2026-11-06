# Visual Palette Preview — implementation notes

*November 6, 2026 — experimental styling branch*

This is a reversible first styling iteration, **not** a final palette decision or a production accessibility sign-off.

## Current preview

A small native select control in the top bar switches among five palettes: Maritime & Coral (default), Botanical & Citrus, Indigo & Copper, Mediterranean, and Ink & Marigold. Selection is stored in browser localStorage under `life-is-too-short.palette-preview`; the document root exposes `data-palette`.

The selector is a **developer preview**, not a final user-facing settings feature. No task records or Supabase preferences are affected.

## Architecture

- `src/styles/_tokens.scss` owns palette primitives and app semantic color contracts.
- Existing variables such as `--text-primary` remain as temporary compatibility aliases.
- Components own their own layout and styles and reference semantic tokens.
- `src/assets/primeng-style-preset.ts` bridges PrimeNG's primary colors to the app's semantic tokens. The eventual custom Angular component library should consume the app tokens directly.
- The visual direction is balanced and restrained, with defined card borders and low-depth shadows. Destructive/danger colors remain stable when palettes switch.
- Light mode is fixed for this experiment. Dark mode remains a medium-term goal.

## Local evaluation checklist

1. Open Inbox, All Tasks, Today (focus and planning modes), Upcoming, and a project.
2. Change palettes and check the app shell, sidebar, task rows, planner columns, date tags, PrimeNG buttons and dialogs.
3. Test task completion, scheduling, drag-and-drop, and the delete confirmation. Check that color hasn't obscured interactions.
4. After merging the Markdown task-description branch, check editing and viewing descriptions for any lost or conflicting styles.
5. Check narrow/mobile widths, keyboard focus, and system-dark-mode behavior.
6. Run `pnpm install --frozen-lockfile`, `pnpm run build`, and `pnpm run testNoWatch`.

Do not treat successful compilation as a complete visual or WCAG audit. Contrast and dark palettes need a follow-up design pass.

## Merge note

The Markdown task-description branch and this branch both touch `task-row.component.scss`. Preserve description styles from that branch and the theme styling from this branch if a manual conflict resolution is needed. No database or behavioral task code was modified by this palette branch.

## Design language

- High emphasis: primary task-forward action; usually a filled brand treatment.
- Medium emphasis: supporting operations; often toned/outlined.
- Low emphasis: supporting detail and supplementary actions.
- Conditional status: danger, error, overdue, completion. These are based on meaning rather than simply primary/secondary priority.
- Color is never the only indicator of status. Use icon, label, and visual placement consistently.

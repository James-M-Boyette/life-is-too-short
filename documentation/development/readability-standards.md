# Readability standards

These conventions help readers move between a component's template, class, and stylesheet. Treat them as living guidance and revise them when real examples expose friction.

## TypeScript components

Use this as a reading order when dependencies allow:

1. Injected dependencies.
2. Inputs and models, then outputs.
3. Angular queries and related APIs.
4. Local state, then derived state.
5. Constructor and lifecycle behavior.
6. Template handlers in approximate template order.
7. Private helpers near the behavior they support.

Preserve initializer dependencies, effect timing, and public contracts. AccountControls groups queries before local overlay state and keeps its dismissal API next to its focus helper. TaskScheduler groups the initial date field with its other inputs, before the linked field that reads it.

Group imports by purpose and preserve side-effect import order. Choose meaningful names, use access modifiers and readonly where they communicate intent, and annotate important boundaries such as event handlers. Use interfaces for conventional object contracts and types for unions or other shapes that need them. Prefer multiline bodies and guard clauses where they clarify decisions. Let Prettier wrap signatures as needed. Keep signals and computed values for synchronous state, RxJS for streams where it helps, and Promises for one-off work.

## Angular templates

Use four spaces and existing modern Angular control flow. Separate distinct sections with a blank line when it preserves text and projection behavior. Keep complex attributes easy to scan. Prettier uses the Angular parser, strict HTML whitespace handling, and `bracketSameLine: true` for multiline opening tags.

```html
<button
    type="button"
    [disabled]="pending()"
    (click)="save()">
    Save
</button>
```

Prettier may keep short tags on one line. Self-closing tags and closing tags follow its own rules. Strict whitespace handling can place a delimiter on an unusual line to preserve adjacent inline content. Preserve that output and avoid adding ignore directives for alignment. Prettier preserves the file's existing line-ending convention so checks work after Windows and LF checkouts.

## SCSS

Follow approximate template order. Place new rules near related selectors, and keep local hover, focus, disabled, and selected states nearby. Shared state rules can stay grouped when splitting them would obscure cascade order or duplicate declarations. Use one declaration per line and shallow nesting for stable associations, such as a palette option's `&.selected` modifier. Avoid unnecessary tag qualification and mirroring the DOM hierarchy. Preserve selector output, specificity, and cascade order where they affect rendering, including Angular encapsulation, projection, overlays, responsive rules, and CDK clones.

## VS Code folding

Workspace settings prefer syntax-aware folding through `editor.foldingStrategy: "auto"`. VS Code uses a folding provider when available and otherwise falls back to indentation. Check the active document language and provider if the opening line lacks a fold control. Put the cursor on a TypeScript method declaration or an Angular element's opening line and use **Fold** from the Command Palette. Verify what collapses before changing formatting. Custom closing-bracket indentation is outside the formatter conventions. [VS Code folding documentation](https://code.visualstudio.com/docs/editing/codebasics#_folding)

## Maintenance

Run `pnpm format:check` and review the diff after changes. Apply manual organization to components as they are touched. Keep mechanical formatting separate. If organization requires changing behavior, selector matching, field initializer dependencies, or contracts, discuss it separately.

## Pilot verification

Pass 2A was merged in PR #88. The pilot starts from main at `02d8859`. The mechanical bracket commit changed 12 tracked templates. Manual organization was limited to AccountControls and TaskScheduler. The account stylesheet keeps shared focus and hover rules together and places the logout-specific rule after palette controls. Its nested option rules compile to the same selectors.

The targeted suite passed 15 tests. The full Angular suite passed 413 tests with two opt-in tests skipped. Formatting checks, production builds, and `git diff --check` passed. Bundle input contributions were unchanged before and after for AccountControls (2,503 bytes), TaskScheduler (1,464 bytes), TaskRow (7,146 bytes), and AppSidebar (4,307 bytes). Angular's existing TaskRow and AppSidebar budget warnings remained 7.15 kB and 4.31 kB.

Component tests exercised account overlay interactions and scheduling. Browser visual comparison and actual VS Code fold-range validation were not performed. Angular Language Service was installed, and the workspace uses VS Code's automatic folding strategy. The exact fold range can depend on the active language provider.

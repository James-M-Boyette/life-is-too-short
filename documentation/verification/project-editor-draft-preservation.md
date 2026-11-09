# Project editor draft preservation (F6)

## Reproduced failure

On main after PR #67 (`8697fdc`), the regression opened an existing project, typed an unsaved name, and replaced the project options. It failed before the correction: the input reverted from `Unsaved name` to the persisted `Edited` name. The original initialization effect read projectOptions and reset the entire form whenever those choices refreshed.

## Draft lifecycle

ProjectEditor remains presentational and owns only reactive form state. Following TaskContentEditor's snapshot-per-session convention, initial values are read once per editor instance or when the edited project ID changes (including Edit-to-Create). Same-ID project snapshots do not overwrite drafts. The existing AppShell conditional destroys the editor on close, so reopening the same project or opening a fresh Create dialog naturally gets a new snapshot; no new session input or shell changes are needed.

Initialization reads options untracked. A separate effect synchronizes the selected parent node to current TreeSelect options by key, retaining unsaved name, parent intent, and dirty/touched state. Disabling/enabling is independent of options and does not reset the form; validator reads are untracked in that effect to avoid accidental dependencies.

If a selected parent disappears or becomes excluded, the editor retains that selection and the name draft, displays an accessible error, and blocks Save. It does not silently clear the relationship. The user can explicitly clear or select an available parent. If choices are temporarily empty and the selected parent returns, it rebinds by identity and becomes valid again. An initially missing parent is represented as `Unavailable project` and is likewise invalid until resolved.

Parent membership is revalidated on submit as well as options changes, protecting submission before the synchronization effect runs. The existing edited-branch exclusion is unchanged; this adds no new hierarchy rules or backend validation. ProjectsStore remains responsible for persistence and authoritative hierarchy validation.

## Verification

- Relevant editor/shell/project-dialog tests: 55 passed across 4 files.
- Full suite: 337 passed across 23 files, retaining PR #67 and earlier correctness coverage.
- Production build: passed. Existing stylesheet warnings remain: TaskRow 7.62 kB and AppSidebar 4.31 kB, below the 8 kB error threshold.
- git diff --check: passed.
- Added 9 editor regression/interaction tests and 1 shell cancel/reopen test. Existing tests retained.
- Component tests use real PrimeNG TreeSelect keyboard opening, DOM node selection, clearing, selected labels/aria-selected state, and emitted save payloads. They verify replacement node objects, same-ID project snapshots, explicit parent clearing, project switching, Create initialization, disabled/reenabled drafts, unavailable/descendant parents, options loading, required-name validation, and fresh dialogs after cancellation.
- No manual browser check was required to establish selection retention: actual TreeSelect/CVA interactions were exercised rather than mocking the selection or setting private form controls. This does not establish physical-device or screen-reader acceptance.
- Existing reactive-form disabled-attribute warnings in broader tests remain unrelated.

## Review and limits

Reviewed effect dependencies, initialization ordering, missing-parent handling, disabled validation, same-ID snapshots, output safety, and scope. Production changes are limited to ProjectEditor TypeScript/template; shell changes are tests only. No SCSS, CRUD, stores, scheduling, schema, RLS, services, or shell-session protections changed.

Same-project server changes are intentionally not merged into an active draft, even if a field has not been modified; close and reopen to initialize from current values. No multi-client conflict-resolution policy is added. A consumer that retains the same editor instance across an otherwise invisible new session would need an explicit session boundary; the current AppShell already recreates it and is covered by integration tests.

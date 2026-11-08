# Account session state isolation

## Reproduced regression

Before the production change, the deferred-response test loaded Account B's projects, then resolved Account A's earlier refresh. The original store replaced B's rows with A's rows. The regression failed on the actual mismatched account data, then passed with the guards.

## Behavior and ownership

ProjectsStore now uses SUPABASE_CLIENT injection. Every observed user-ID transition invalidates the session generation and clears project rows, errors, and refresh loading. Public async entry points also synchronize the session before validating input. Response guards check both generation and current authenticated user ID.

Only the latest-started refresh can replace the collection or finish refresh loading. The latest-started network operation owns shared error reporting; older failures still reject their original callers but cannot replace newer error state. CRUD does not acquire refresh loading. Automatic refresh catches its rejected Promise after refresh records any current error.

Create/update/delete retain their public return types and existing validation/query/RPC behavior. An obsolete remote operation may already have persisted: success still resolves to its original caller, failure still rejects, but neither updates the new session's local state. UI callers must retain their existing dialog/session protections. No remote cancellation is claimed.

TasksStore now clears its collection on direct A-to-B transitions as well as logout. Mutation queues, revisions, reconciliation, and Realtime lifecycle are unchanged.

## Verification

- Focused store tests: 66 passing (14 project tests, 52 task tests).
- Full suite: 273 tests passing across 22 files.
- Production build: passed. Existing stylesheet warnings remain: TaskRow 7.62 kB and AppSidebar 4.31 kB against the 4 kB warning threshold, below the 8 kB error threshold.
- git diff --check: passed.
- Tests use injected fake clients and deferred Promises; no production data is used.

Coverage includes obsolete refresh/CRUD success and failure, logout/reauthentication, reverse response order, refresh/loading/error ownership, automatic refresh rejection, normal CRUD/reparent/deletion behavior, and immediate task clearing on account switches.

## Deliberately deferred

- F2: TasksStore refresh-versus-mutation revision race.
- F3: optimistic creation ID / Realtime insert reconciliation.
- F4: TasksStore stale refresh error/loading ownership.
- Same-account project refresh-versus-CRUD snapshot reconciliation and concurrent project mutations are not serialized by this change.
- Session boundaries follow the existing AuthStore userId signal. Same-user token renewal is not treated as an account change; transitions not observable through that signal cannot be distinguished here.

These are frontend lifecycle protections, not authorization. RLS and the deletion RPC remain unchanged. Independent security review is recommended before deployment because this work concerns cross-account isolation; frontend tests do not establish database authorization.

# Task creation identity reconciliation (F3)

## Original failure

A deterministic regression modeled the checked-in database UUID default: when INSERT omitted id, the server generated another identity. Realtime INSERT arrived first, adding the server row beside the optimistic row. Once HTTP replaced the optimistic row, the collection contained two rows with the same persisted ID (two entries, one unique ID). The test failed before production changes and now passes.

## Identity and schema compatibility

A single crypto.randomUUID() identifies the optimistic task, INSERT payload, Realtime row, HTTP response, and later mutations. No migration is required: the baseline tasks.id is a UUID with a gen_random_uuid() default, not a generated-always column; tasks_pkey enforces uniqueness. The checked-in tasks_owner_all policy validates user_id against auth.uid(), independently of UUID generation. Project ownership foreign keys remain unchanged.

These are static checks of the checked-in schema and policies, not an audit of the deployed database. No production data or security settings were accessed or changed.

## Exact lifecycle

1. Register a per-ID creation settlement Promise, pending protection, and a task revision; show the optimistic row immediately. Preserve existing position calculations and scheduling inputs.
2. Insert using that same UUID. Realtime INSERT echoes for a pending creation are ignored: the HTTP response confirms that row and its timestamps/defaults without an extra GET. Realtime UPDATE during creation retains the existing deferred-reconciliation behavior.
3. On HTTP success, validate returned identity/owner and replace all local copies of that ID with the full server row. Realtime upsert and the existing sorted collection normalization defensively deduplicate by ID.
4. On failure, remove only the failed creation and retain unrelated tasks. Advance the revision after either success or rollback so overlapping refreshes preserve the settled result, extending the same revision invariant established in PR #65.
5. Remove creation tracking and update creating based on remaining inserts. If no queued mutation owns that ID, clear pending protection and consume deferred reconciliation through the existing single-task query. If mutations are queued, they retain pending/reconciliation ownership until the final queued mutation settles.
6. Existing per-task queues wait on the creation Promise only when there is no prior queued mutation. This prevents an UPDATE/DELETE against a not-yet-confirmed INSERT, without changing queue ordering or disabling unrelated task interactions. Release the creation gate for obsolete sessions too, so queued operations can reach their existing session-cancellation guard.
7. Account changes clear creation tracking with other account-owned state. Existing creation/subscription session guards suppress obsolete HTTP results and Realtime callbacks. The single-task reconciliation used after creation now also checks session/user identity before applying a response and records its accepted revision for overlapping refreshes.

Public addTask still resolves on success and rejects insert failures. An unexpected response ID or owner fails safely instead of substituting another task. Existing refresh and mutation queues, public API signatures, Realtime subscriptions, ordering fields, and schema are retained.

## Verification

- New regression was red before implementation.
- Focused TasksStore/ProjectsStore run: 94 passed (80 task, 14 project), including F1, F2 and F4 regressions.
- Full suite: 301 passed across 22 files.
- Production build: passed. Existing TaskRow (7.62 kB) and AppSidebar (4.31 kB) stylesheet warnings remain, below the 8 kB error threshold.
- git diff --check: passed.
- Added 12 deterministic tests covering both event orders, repeated INSERTs, server defaults, deferred UPDATEs, rollback/retry, obsolete session responses/events, reconciliation after account switching, refresh success/failure races, queued editing, subsequent deletion, concurrent creation loading, and unexpected server identity.
- Updated the existing optimistic-refresh test: it must now expect the persisted UUID to equal the optimistic UUID, rather than replacement with a different UUID. Its refresh-protection assertions are retained.
- Self-review checked gate release, queued-mutation ownership, bookkeeping cleanup, cross-session responses, revision tombstones, and scope. No browser-only visual behavior changed.

## Remaining limits

Network failure can be ambiguous: remote persistence may already have happened even when the client rolls back. A later refresh can reveal that task. This does not add automatic retries or a new idempotency protocol. A failed follow-up reconciliation retains the HTTP-confirmed row and uses the existing console-error path; a later refresh/Realtime event can reconcile it. Requests are not cancelled remotely. General cross-client conflict resolution, same-user session semantics, and unrelated database authorization review remain separate work. Independent security review is recommended before production deployment; frontend tests do not establish RLS enforcement.

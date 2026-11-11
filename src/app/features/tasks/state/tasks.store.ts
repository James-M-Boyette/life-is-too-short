import type { TaskContent } from '../models/task-content.model';
/** ToDo:
    [] Split repository/data-access concerns from application state
*/
import { Injectable, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TASK_SYNC_CONFIG } from './task-sync.config';
import type { RealtimeChannel } from '@supabase/supabase-js';
// import { supabase } from '@/shared/supabase/supabase.client';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';
import type { TaskStatus, Task } from '@/features/tasks/models/tasks.model';
import type { TaskPlanningPlacement } from '@/features/tasks/models/task-schedule-drop.model';

import type { TaskOrderField } from '@/features/tasks/utils/task-ordering.util';

import {
    getFirstTaskPosition,
    getNextTaskPosition,
    getTaskPlanningContext,
    calculateTaskPosition,
} from '@/features/tasks/utils/task-ordering.util';

// Type for inserting a new task
type NewTaskInsert = {
    user_id: string;
    title: string;
};

type AddTaskInput = {
    title: string;
    description: string | null;
    projectId: string | null;
    plannedDate?: string | null;
};

@Injectable({ providedIn: 'root' })
export class TasksStore {
    readonly tasks = signal<Task[]>([]); // What Tasks are currently available?
    private readonly supabase = inject(SUPABASE_CLIENT);
    readonly loading = signal(false); // Are we fetching them?
    readonly creating = signal(false); // Are we in the process of creating a new task (showing the form)?
    readonly mutating = signal(false); // Are we performing a mutation (add, update, delete) on the server?
    private readonly pendingTaskIds = new Set<string>();
    private readonly pendingCreations = new Map<string, Promise<void>>();
    private readonly taskMutationQueues = new Map<string, Promise<void>>();
    private readonly tasksNeedingReconciliation = new Set<string>();
    private readonly taskRevisions = new Map<string, number>();
    private sessionGeneration = 0;
    private latestRefreshRequest = 0;
    readonly error = signal<string | null>(null); // Did fetching or mutating fail?

    readonly realtimeConnected = signal(false);
    readonly syncError = signal<string | null>(null);
    readonly lastSyncedAt = signal<number | null>(null);
    readonly lastInvalidationAt = signal<number | null>(null);
    private readonly syncConfig = inject(TASK_SYNC_CONFIG);
    private readonly document = inject(DOCUMENT);
    private wakeSync: (() => void) | null = null;
    private syncConnectionFailed = false;
    private backgroundAbort: AbortController | null = null;

    private channel: RealtimeChannel | null = null;

    private async runMutation<T>(
        taskId: string,
        fn: (isCurrentSession: () => boolean) => Promise<T>,
    ): Promise<T> {
        // Capture the session when the mutation is requested.
        const generationAtStart = this.sessionGeneration;

        const isCurrentSession = () => generationAtStart === this.sessionGeneration;

        const previous = this.taskMutationQueues.get(taskId)
            ?? this.pendingCreations.get(taskId)
            ?? Promise.resolve();

        const operation = previous
            .catch(() => undefined)
            .then(async () => {
                // A queued operation must not start after logout
                // or an account switch.
                if (!isCurrentSession()) {
                    throw new Error('Mutation cancelled: session changed');
                }

                this.error.set(null);
                this.markTaskChanged(taskId);

                try {
                    return await fn(isCurrentSession);
                } finally {
                    // A refresh started during this mutation must also see its
                    // settlement (confirmed save or rollback) as a newer revision.
                    // Retain revisions for deleted rows as refresh tombstones.
                    if (isCurrentSession()) this.markTaskChanged(taskId);
                }
            });

        const settled = operation.then(
            () => undefined,
            () => undefined,
        );

        this.taskMutationQueues.set(taskId, settled);
        this.pendingTaskIds.add(taskId);
        this.mutating.set(true);

        try {
            return await operation;
        } catch (error: unknown) {
            // Only the session that initiated this request
            // may update the shared error signal.
            if (isCurrentSession()) {
                this.error.set(error instanceof Error ? error.message : 'Failed to update task');
            }

            throw error;
        } finally {
            if (this.taskMutationQueues.get(taskId) === settled) {
                this.taskMutationQueues.delete(taskId);
                this.pendingTaskIds.delete(taskId);

                if (isCurrentSession() && this.tasksNeedingReconciliation.delete(taskId)) {
                    try {
                        await this.reconcileTask(taskId);
                    } catch (error) {
                        console.error('Failed to reconcile task after Realtime update:', error);
                    }
                }
            }

            if (isCurrentSession()) {
                this.mutating.set(this.taskMutationQueues.size > 0);
                this.wakeSync?.();
            }
        }
    }

    constructor(private readonly auth: AuthStore) {
        // Baseline refresh + realtime subscription lifecycle
        effect((onCleanup) => {
            const userId = this.auth.userId();

            // Invalidate requests started under the previous session.
            this.sessionGeneration++;

            this.taskMutationQueues.clear();
            this.pendingTaskIds.clear();
            this.pendingCreations.clear();
            this.tasksNeedingReconciliation.clear();
            this.taskRevisions.clear();

            this.mutating.set(false);
            this.creating.set(false);
            this.loading.set(false);
            this.error.set(null);
            this.syncError.set(null);
            this.syncConnectionFailed = false;
            this.lastSyncedAt.set(null);
            this.lastInvalidationAt.set(null);
            this.realtimeConnected.set(false);

            // Always tear down prior subscription when user changes/logs out
            this.teardownRealtime();

            // Clear account-owned rows on logout and direct account switches.
            this.tasks.set([]);
            // If no user, mark realtime as disconnected
            if (!userId) {
                this.realtimeConnected.set(false);
                return;
            }

            if (this.syncConfig.mode !== 'postgres-changes') {
                const cleanup = this.startInvalidationSync(userId);
                onCleanup(cleanup);
                // Prompt initial UI load; the joined channel still requires catch-up.
                void this.refreshTasks().catch(() => undefined);
                return;
            }

            // Load current state once
            void this.refreshTasks().catch(() => {
                // refreshTasks() has already recorded the error in this.error.
            });

            // Start realtime subscription scoped to this user
            // Capture the session that owns this subscription.
            const generationAtStart = this.sessionGeneration;

            const isCurrentSession = () =>
                generationAtStart === this.sessionGeneration && this.auth.userId() === userId;

            // Start Realtime for the authenticated user.
            this.channel = this.supabase
                .channel(`tasks:${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'tasks',
                        filter: `user_id=eq.${userId}`,
                    },
                    (payload) => {
                        if (!isCurrentSession()) {
                            return;
                        }

                        this.onTasksChange(payload);
                    },
                )
                .subscribe((status, error) => {
                    if (!isCurrentSession()) {
                        return;
                    }

                    this.realtimeConnected.set(status === 'SUBSCRIBED');
                });

            onCleanup(() => this.teardownRealtime());
        });
    }

    private teardownRealtime() {
        if (this.channel) {
            void this.supabase.removeChannel(this.channel).catch(() => undefined);
            this.channel = null;
        }
    }

    private startInvalidationSync(userId: string): () => void {
        const generation = this.sessionGeneration;
        let disposed = false;
        const current = () => !disposed && generation === this.sessionGeneration && this.auth.userId() === userId;
        const view = this.document.defaultView;
        const available = () => view?.navigator.onLine !== false && this.document.visibilityState !== 'hidden';
        let dirty = 0, completed = 0, running = false, protectedGeneration = 0;
        let firstDirtyAt: number | null = null;
        let attempts = 0, retryAt = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const clearTimer = () => { clearTimeout(timer); timer = undefined; };
        const schedule = (immediate = false) => {
            if (!current() || running || !available() || this.loading() || dirty === completed || attempts > 3) return;
            if (dirty <= protectedGeneration && this.pendingTaskIds.size > 0) return;
            clearTimer();
            const now = Date.now();
            firstDirtyAt ??= now;
            const delay = immediate ? 0 : Math.max(0, Math.min(150, firstDirtyAt + 1000 - now));
            timer = setTimeout(() => { timer = undefined; void run(); }, Math.max(delay, retryAt - now));
        };
        const invalidate = (immediate = false, resetRetries = false) => {
            if (!current()) return;
            dirty++;
            if (resetRetries) { attempts = 0; retryAt = 0; }
            schedule(immediate);
        };
        const run = async () => {
            if (!current() || running || !available() || this.loading()) return;
            if (dirty <= protectedGeneration && this.pendingTaskIds.size > 0) return;
            running = true;
            const target = dirty;
            firstDirtyAt = null;
            const controller = new AbortController();
            this.backgroundAbort = controller;
            const snapshot = this.refreshSnapshot(true, controller.signal);
            const request = this.latestRefreshRequest;
            try {
                const result = await this.withSnapshotDeadline(snapshot, controller, 'Task synchronization timed out');
                if (!current()) return;
                if (result.applied) {
                    attempts = 0; retryAt = 0;
                    protectedGeneration = result.protected ? target : 0;
                    if (!result.protected) completed = target;
                }
            } catch (error) {
                if (!current()) return;
                if (request !== this.latestRefreshRequest) return;
                if (controller.signal.aborted && request === this.latestRefreshRequest) {
                    this.syncError.set(`${error instanceof Error ? error.message : 'Task synchronization cancelled'}. Refresh the task list to retry.`);
                }
                attempts++;
                retryAt = Date.now() + ([1000, 5000, 15000][attempts - 1] ?? 15000);
            } finally {
                if (this.backgroundAbort === controller) this.backgroundAbort = null;
                running = false;
                if (current()) schedule();
            }
        };
        const wake = () => schedule();
        this.wakeSync = wake;
        const resume = () => { if (available()) invalidate(true, true); else clearTimer(); };
        view?.addEventListener('online', resume);
        view?.addEventListener('offline', resume);
        view?.addEventListener('pageshow', resume);
        this.document.addEventListener('visibilitychange', resume);
        // The SDK alone owns channel reconnect/rejoin. Every successful join
        // triggers a read, including joins following a missed-event window.
        if (this.syncConfig.mode === 'broadcast') {
            this.channel = this.supabase.channel(`task-invalidation:${userId}`, { config: { private: true } })
            .on('broadcast', { event: 'tasks_changed_v1' }, message => {
                if (!current() || message?.['payload']?.v !== 1) return;
                this.lastInvalidationAt.set(Date.now());
                invalidate();
            }).subscribe(status => {
                if (!current()) return;
                this.realtimeConnected.set(status === 'SUBSCRIBED');
                if (status === 'SUBSCRIBED') {
                    this.syncConnectionFailed = false;
                    invalidate(true, true);
                }
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    this.syncConnectionFailed = true;
                    this.syncError.set('Live task connection unavailable. Refresh the task list to catch up.');
                }
            });
        }
        // Best-effort notifications can be lost even while the socket is joined.
        // This modest safety read is paused when hidden/offline; it is not a
        // second websocket reconnect loop or a claim of durable replay.
        const safety = this.syncConfig.safetyRefreshMs > 0
            ? setInterval(() => { if (available()) invalidate(false, true); }, this.syncConfig.safetyRefreshMs)
            : undefined;
        return () => {
            disposed = true;
            this.backgroundAbort?.abort(new Error('Task synchronization session ended'));
            clearTimer(); clearInterval(safety);
            view?.removeEventListener('online', resume);
            view?.removeEventListener('offline', resume);
            view?.removeEventListener('pageshow', resume);
            this.document.removeEventListener('visibilitychange', resume);
            if (this.wakeSync === wake) this.wakeSync = null;
            this.teardownRealtime();
        };
    }

    // Payload typing is annoyingly loose in supabase-js; we’re keeping it safe for now ...
    private onTasksChange(payload: any) {
        const eventType: string = payload.eventType;

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const row = payload.new as Task;
            // The HTTP response confirms this creation echo, including defaults.
            // UPDATE events still use deferred reconciliation for newer server edits.
            if (eventType === 'INSERT' && this.pendingCreations.has(row.id)) return;
            this.upsertFromRealtime(row);
            return;
        }

        if (eventType === 'DELETE') {
            const oldRow = payload.old as Task;
            if (oldRow?.id) this.removeFromRealtime(oldRow.id);
        }
    }

    private markTaskChanged(taskId: string): void {
        const currentRevision = this.taskRevisions.get(taskId) ?? 0;
        this.taskRevisions.set(taskId, currentRevision + 1);
    }

    private upsertFromRealtime(row: Task): void {
        // Record that we've observed another Realtime event.
        this.markTaskChanged(row.id);

        // Protect optimistic mutations from incoming updates.
        if (this.pendingTaskIds.has(row.id)) {
            this.tasksNeedingReconciliation.add(row.id);
            return;
        }

        this.tasks.update(tasks => this.sortDesc([
            row,
            ...tasks.filter(task => task.id !== row.id),
        ]));
    }

    private removeFromRealtime(id: string): void {
        this.markTaskChanged(id);

        this.tasks.update((tasks) => tasks.filter((task) => task.id !== id));
    }

    private sortDesc(list: Task[]) {
        // Defensive normalization for refresh, creation, and Realtime entry points.
        return [...new Map(list.map(task => [task.id, task])).values()].sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
        );
    }

    async refreshTasks(): Promise<void> {
        this.backgroundAbort?.abort(new Error('Task synchronization superseded by manual refresh'));
        const generation = this.sessionGeneration;
        const userId = this.auth.userId();
        const controller = new AbortController();
        const timeoutMessage = 'Task refresh timed out. Check your connection and try again.';
        const snapshot = this.refreshSnapshot(false, controller.signal);
        const request = this.latestRefreshRequest;
        try {
            await this.withSnapshotDeadline(snapshot, controller, timeoutMessage);
        } catch (error: unknown) {
            // A timed-out transport may never run refreshSnapshot's finally block.
            if (controller.signal.aborted && request === this.latestRefreshRequest &&
                generation === this.sessionGeneration && userId === this.auth.userId()) {
                this.error.set(timeoutMessage);
                this.loading.set(false);
                this.wakeSync?.();
            }
            throw error;
        }
    }

    private async withSnapshotDeadline<T>(snapshot: Promise<T>, controller: AbortController, message: string): Promise<T> {
        // Bound the complete snapshot even if the transport ignores cancellation.
        const { signal } = controller;
        const deadline = setTimeout(() => controller.abort(new Error(message)), 30_000);
        let rejectAbort!: () => void;
        const aborted = new Promise<never>((_, reject) => {
            rejectAbort = () => reject(signal.reason);
            if (signal.aborted) rejectAbort();
            else signal.addEventListener('abort', rejectAbort, { once: true });
        });
        try {
            return await Promise.race([snapshot, aborted]);
        } finally {
            clearTimeout(deadline);
            signal.removeEventListener('abort', rejectAbort);
        }
    }

    private async refreshSnapshot(background: boolean, signal: AbortSignal): Promise<{ applied: boolean; protected: boolean }> {
        const generationAtStart = this.sessionGeneration;
        const userIdAtStart = this.auth.userId();
        const requestId = ++this.latestRefreshRequest;
        // Latest-started refresh owns all refresh state. Check auth directly
        // as well, covering a switch before the constructor effect runs.
        const ownsRefresh = () =>
            generationAtStart === this.sessionGeneration &&
            userIdAtStart === this.auth.userId() &&
            requestId === this.latestRefreshRequest && !signal.aborted;

        // Snapshot the revisions when this particular query starts.
        const revisionsAtStart = new Map(this.taskRevisions);

        if (!background) {
            this.loading.set(true);
            this.error.set(null);
        }

        try {
            const fetchedTasks: Task[] = [];
            let cursor: string | undefined;
            // ID is unique and is not changed by normal task mutations. Offset
            // pagination can skip rows when an earlier row is deleted mid-fetch.
            // Keep presentation ordering in sortDesc(), separate from retrieval.
            while (ownsRefresh()) {
                let query = this.supabase.from('tasks').select('*')
                    .order('id', { ascending: true });
                if (cursor !== undefined) query = query.gt('id', cursor);
                const { data, error } = await query.abortSignal(signal).limit(500);
                if (error) throw error;
                if (!ownsRefresh()) return { applied: false, protected: false };
                if (!Array.isArray(data)) throw new Error('Incomplete task snapshot: invalid page');
                // Do not infer completion from a short page: an API cap may be
                // lower than our requested limit. Only an empty page ends fetch.
                if (data.length === 0) break;
                for (const task of data as Task[]) {
                    if (typeof task?.id !== 'string' || !task.id ||
                        (cursor !== undefined && task.id <= cursor) ||
                        (userIdAtStart !== null && task.user_id !== userIdAtStart)) {
                        throw new Error('Incomplete task snapshot: invalid ownership or ID order');
                    }
                    cursor = task.id;
                    fetchedTasks.push(task);
                }
            }
            if (!ownsRefresh()) return { applied: false, protected: false };

            let protectedTasks = this.pendingTaskIds.size > 0;
            this.tasks.update((currentTasks) => {
                const currentById = new Map(currentTasks.map((task) => [task.id, task]));

                const merged = new Map<string, Task>();

                for (const fetched of fetchedTasks) {
                    const previousRevision = revisionsAtStart.get(fetched.id) ?? 0;

                    const currentRevision = this.taskRevisions.get(fetched.id) ?? 0;

                    const changedDuringRefresh = previousRevision !== currentRevision;

                    const isPending = this.pendingTaskIds.has(fetched.id);

                    if (changedDuringRefresh || isPending) {
                        protectedTasks = true;
                        // A newer change occurred. Keep its current state,
                        // or leave it deleted if no current row exists.
                        const current = currentById.get(fetched.id);

                        if (current) {
                            merged.set(fetched.id, current);
                        }

                        continue;
                    }

                    merged.set(fetched.id, fetched);
                }

                // Preserve tasks added or modified locally after the
                // refresh started, even if they weren't in its response.
                for (const current of currentTasks) {
                    if (merged.has(current.id)) continue;

                    const changedDuringRefresh =
                        (this.taskRevisions.get(current.id) ?? 0) !==
                        (revisionsAtStart.get(current.id) ?? 0);

                    if (changedDuringRefresh || this.pendingTaskIds.has(current.id)) {
                        protectedTasks = true;
                        merged.set(current.id, current);
                    }
                }

                return this.sortDesc([...merged.values()]);
            });
            this.syncError.set(this.syncConnectionFailed
                ? 'Live task connection unavailable. Refresh the task list to catch up.' : null);
            if (!protectedTasks) this.lastSyncedAt.set(Date.now());
            return { applied: true, protected: protectedTasks };
        } catch (error: unknown) {
            if (ownsRefresh()) {
                const message = error instanceof Error ? error.message : 'Failed to load tasks';
                if (background) this.syncError.set(`Task synchronization failed: ${message}. Refresh the task list to retry.`);
                else this.error.set(message);
            }
            // Supersession suppresses store writes, not rejection to the caller.
            throw error;
        } finally {
            if (!background && ownsRefresh()) this.loading.set(false);
            if (!background && !signal.aborted && generationAtStart === this.sessionGeneration && userIdAtStart === this.auth.userId()) this.wakeSync?.();
        }
    }

    async addTask(input: AddTaskInput) {
        const userId = this.auth.userId();

        if (!userId) throw new Error(`✋⛔ User not authenticated`);

        const generationAtStart = this.sessionGeneration;

        const isCurrentSession = () =>
            generationAtStart === this.sessionGeneration && this.auth.userId() === userId;

        const existingTasks = this.tasks().filter((task) => task.user_id === userId);

        // Find tasks belonging to the same project.
        // null represents Inbox.
        const projectTasks = existingTasks.filter((task) => task.project_id === input.projectId);

        const projectPosition = getFirstTaskPosition(projectTasks, 'project_position');

        const plannedDate = input.plannedDate ?? null;

        const destinationTask = {
            planned_date: plannedDate,
            due_date: null,
        } as Task;

        const destinationContext = getTaskPlanningContext(destinationTask);

        const destinationTasks = existingTasks.filter(
            (task) => getTaskPlanningContext(task) === destinationContext,
        );

        const plannedPosition = getFirstTaskPosition(destinationTasks, 'planned_position');

        this.error.set(null);
        this.creating.set(true);

        const taskId = crypto.randomUUID();
        let finishCreation!: () => void;
        const creationSettled = new Promise<void>(resolve => { finishCreation = resolve; });
        this.pendingCreations.set(taskId, creationSettled);

        const optimistic: Task = {
            id: taskId,
            user_id: userId,
            project_id: input.projectId,

            title: input.title,
            is_done: false,

            description: input.description,

            planned_date: plannedDate,
            due_date: null,
            due_at: null,

            project_position: projectPosition,
            planned_position: plannedPosition,

            status: 'todo',

            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        // Use the same identity for optimistic state, INSERT, and Realtime.
        // Mutations targeting this row wait for creation through the existing queue.
        this.pendingTaskIds.add(taskId);
        this.markTaskChanged(taskId);

        this.tasks.update((prev) => [optimistic, ...prev.filter(task => task.id !== taskId)]);

        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .insert({
                    id: taskId,
                    user_id: userId,
                    title: input.title,
                    description: input.description,
                    project_id: input.projectId,
                    planned_date: plannedDate,
                    project_position: projectPosition,
                    planned_position: plannedPosition,
                })
                .select('*')
                .single();

            if (error) {
                throw error;
            }

            if (!isCurrentSession()) {
                return;
            }

            const saved = data as Task;
            if (saved.id !== taskId || saved.user_id !== userId) {
                throw new Error('Created task identity does not match the request');
            }
            this.tasks.update(prev => this.sortDesc([
                saved,
                ...prev.filter(task => task.id !== taskId),
            ]));
        } catch (e: unknown) {
            if (isCurrentSession()) {
                // Remove the failed optimistic task.
                this.tasks.update((prev) => prev.filter((task) => task.id !== taskId));

                this.error.set(e instanceof Error ? e.message : 'Failed to create task');
            }

            throw e;
        } finally {
            if (isCurrentSession()) {
                // Preserve a confirmed insert or rollback against overlapping refreshes.
                this.markTaskChanged(taskId);
                this.pendingCreations.delete(taskId);
                this.creating.set(this.pendingCreations.size > 0);
                // A queued mutation owns pending/reconciliation state until it settles.
                if (!this.taskMutationQueues.has(taskId)) {
                    this.pendingTaskIds.delete(taskId);
                    if (this.tasksNeedingReconciliation.delete(taskId)) {
                        try {
                            await this.reconcileTask(taskId);
                        } catch (error) {
                            console.error('Failed to reconcile task after creation:', error);
                        }
                    }
                }
            }
            finishCreation();
            if (isCurrentSession()) this.wakeSync?.();
        }
    }

    async updateContent(task: Task, content: TaskContent): Promise<void> {
        const title = content.title.trim();
        if (!title) throw new Error('A task title is required');
        const source = content.description ?? '';
        const description = source.trim() ? source : null;

        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find(current => current.id === task.id);
            if (!currentTask) throw new Error('Task no longer exists');
            if (currentTask.user_id !== task.user_id) throw new Error('Task ownership changed');
            if (currentTask.title === title && currentTask.description === description) return;
            const previous = { title: currentTask.title, description: currentTask.description };
            const next = { title, description };
            this.tasks.update(tasks => tasks.map(current => current.id === task.id ? { ...current, ...next } : current));
            try {
                const { data, error } = await this.supabase.from('tasks')
                    .update(next).eq('id', currentTask.id).eq('user_id', currentTask.user_id)
                    .select('title, description').single();
                if (error) throw error;
                if (!isCurrentSession()) return;
                // Merge only content fields; unrelated local state may have changed during the request.
                this.tasks.update(tasks => tasks.map(current => current.id === task.id
                    ? { ...current, title: data.title, description: data.description } : current));
            } catch (error) {
                if (isCurrentSession()) {
                    this.tasks.update(tasks => tasks.map(current => current.id === task.id ? { ...current, ...previous } : current));
                }
                throw error;
            }
        });
    }

    async updateTitle(task: Task, title: string): Promise<void> {
        const nextTitle = title.trim();

        if (!nextTitle) {
            return;
        }

        await this.runMutation(task.id, async (isCurrentSession) => {
            // Read the latest state when this queued operation begins,
            // rather than using the snapshot supplied by the component.
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            if (currentTask.title === nextTitle) {
                return;
            }

            const previousTitle = currentTask.title;

            // Change only the properties owned by this mutation.
            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id
                        ? {
                              ...current,
                              title: nextTitle,
                          }
                        : current,
                ),
            );

            try {
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({ title: nextTitle })
                    .eq('id', task.id)
                    .eq('user_id', task.user_id)
                    .select('*')
                    .single();

                if (error) {
                    throw error;
                }

                // This request may have completed after an account switch.
                if (!isCurrentSession()) {
                    return;
                }

                // Only apply the response if its session is still active.
                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                if (isCurrentSession()) {
                    this.tasks.update((tasks) =>
                        tasks.map((current) =>
                            current.id === task.id ? { ...current, title: previousTitle } : current,
                        ),
                    );
                }

                throw error;
            }
        });
    }

    async updateDescription(task: Task, description: string | null): Promise<void> {
        const value = description ?? '';
        const normalized = value.trim() ? value : null;

        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            if (currentTask.description === normalized) {
                return;
            }

            const previousDescription = currentTask.description;

            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id ? { ...current, description: normalized } : current,
                ),
            );

            try {
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({ description: normalized })
                    .eq('id', task.id)
                    .eq('user_id', task.user_id)
                    .select('*')
                    .single();

                if (error) throw error;

                if (!isCurrentSession()) {
                    return;
                }

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                if (isCurrentSession()) {
                    this.tasks.update((tasks) =>
                        tasks.map((current) =>
                            current.id === task.id
                                ? { ...current, description: previousDescription }
                                : current,
                        ),
                    );
                }

                throw error;
            }
        });
    }

    async updateTaskPosition(task: Task, field: TaskOrderField, position: number): Promise<void> {
        if (!Number.isFinite(position)) {
            throw new Error('Invalid task position');
        }

        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            // Compare against the latest state, not the original argument.
            if (currentTask[field] === position) {
                return;
            }

            const previousPosition = currentTask[field];

            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id ? { ...current, [field]: position } : current,
                ),
            );

            try {
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({ [field]: position })
                    .eq('id', task.id)
                    .eq('user_id', task.user_id)
                    .select('*')
                    .single();

                if (error) throw error;

                if (!isCurrentSession()) {
                    return;
                }

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                if (isCurrentSession()) {
                    this.tasks.update((tasks) =>
                        tasks.map((current) =>
                            current.id === task.id
                                ? { ...current, [field]: previousPosition }
                                : current,
                        ),
                    );
                }

                throw error;
            }
        });
    }

    async updateProject(task: Task, projectId: string | null): Promise<void> {
        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            // Check against the latest state, not the caller's snapshot.
            if (currentTask.project_id === projectId) {
                return;
            }

            const previousProjectId = currentTask.project_id;
            const previousPosition = currentTask.project_position;

            // Determine the next position in the destination project.
            // A null projectId represents Inbox.
            const destinationTasks = this.tasks().filter(
                (current) =>
                    current.id !== task.id &&
                    current.user_id === currentTask.user_id &&
                    current.project_id === projectId,
            );

            const position = getNextTaskPosition(destinationTasks, 'project_position');

            // Update both related fields together.
            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id
                        ? {
                              ...current,
                              project_id: projectId,
                              project_position: position,
                          }
                        : current,
                ),
            );

            try {
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({
                        project_id: projectId,
                        project_position: position,
                    })
                    .eq('id', task.id)
                    .eq('user_id', currentTask.user_id)
                    .select('*')
                    .single();

                if (error) throw error;

                if (!isCurrentSession()) {
                    return;
                }

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                if (isCurrentSession()) {
                    // Restore only the fields owned by this operation.
                    this.tasks.update((tasks) =>
                        tasks.map((current) =>
                            current.id === task.id
                                ? {
                                      ...current,
                                      project_id: previousProjectId,
                                      project_position: previousPosition,
                                  }
                                : current,
                        ),
                    );
                }

                throw error;
            }
        });
    }

    async updatePlannedDate(task: Task, plannedDate: string | null, placement?: TaskPlanningPlacement): Promise<void> {
        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            if (currentTask.planned_date === plannedDate && !placement) {
                return;
            }

            const previousDate = currentTask.planned_date;
            const previousPosition = currentTask.planned_position;

            const destinationTask: Task = {
                ...currentTask,
                planned_date: plannedDate,
            };

            const currentContext = getTaskPlanningContext(currentTask);
            const destinationContext = getTaskPlanningContext(destinationTask);

            const position = placement
                ? this.plannedInsertionPosition(currentTask, plannedDate, placement)
                : destinationContext === currentContext && previousPosition !== null
                    ? previousPosition
                    : getNextTaskPosition(
                          this.tasks().filter(
                              (current) =>
                                  current.id !== currentTask.id &&
                                  current.user_id === currentTask.user_id &&
                                  getTaskPlanningContext(current) === destinationContext,
                          ),
                          'planned_position',
                      );

            if (!Number.isFinite(position)) throw new Error('Task positions require rebalancing');
            if (currentTask.planned_date === plannedDate && previousPosition === position) return;

            // Optimistically update both fields.
            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id
                        ? {
                              ...current,
                              planned_date: plannedDate,
                              planned_position: position,
                          }
                        : current,
                ),
            );

            try {
                // Persist the scheduling change atomically.
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({
                        planned_date: plannedDate,
                        planned_position: position,
                    })
                    .eq('id', task.id)
                    .eq('user_id', task.user_id)
                    .select('*')
                    .single();

                if (error) throw error;

                if (!isCurrentSession()) {
                    return;
                }

                // Reconcile with the saved row.
                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                if (isCurrentSession()) {
                    // Restore both properties on failure.
                    this.tasks.update((tasks) =>
                        tasks.map((current) =>
                            current.id === task.id
                                ? {
                                      ...current,
                                      planned_date: previousDate,
                                      planned_position: previousPosition,
                                  }
                                : current,
                        ),
                    );
                }

                throw error;
            }
        });
    }

    private plannedInsertionPosition(task: Task, plannedDate: string | null, placement: TaskPlanningPlacement): number {
        if (!plannedDate) throw new Error('An insertion requires a planned date');
        const candidates = this.tasks().filter(current => current.id !== task.id &&
            current.user_id === task.user_id && !current.is_done && current.planned_date === plannedDate);
        const positionOf = (id: string | null): number | null => {
            if (id === null) return null;
            const neighbor = candidates.find(current => current.id === id);
            if (!neighbor || neighbor.planned_position === null || !Number.isFinite(neighbor.planned_position)) {
                throw new Error('The destination order has changed. Please try the drop again.');
            }
            return neighbor.planned_position;
        };
        if (placement.previousTaskId === null && placement.nextTaskId === null && candidates.length) {
            throw new Error('The destination list is no longer empty. Please try the drop again.');
        }
        return calculateTaskPosition(positionOf(placement.previousTaskId), positionOf(placement.nextTaskId));
    }

    async updateDueDate(task: Task, dueDate: string | null): Promise<void> {
        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            if (currentTask.due_date === dueDate) {
                return;
            }

            const previousDate = currentTask.due_date;
            const previousPosition = currentTask.planned_position;

            const destinationTask: Task = {
                ...currentTask,
                due_date: dueDate,
            };

            const currentContext = getTaskPlanningContext(currentTask);
            const destinationContext = getTaskPlanningContext(destinationTask);

            const position =
                currentContext === destinationContext && previousPosition !== null
                    ? previousPosition
                    : getNextTaskPosition(
                          this.tasks().filter(
                              (current) =>
                                  current.id !== currentTask.id &&
                                  current.user_id === currentTask.user_id &&
                                  getTaskPlanningContext(current) === destinationContext,
                          ),
                          'planned_position',
                      );

            // Optimistically update both related properties.
            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id
                        ? {
                              ...current,
                              due_date: dueDate,
                              planned_position: position,
                          }
                        : current,
                ),
            );

            try {
                // Save both properties in one database request.
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({
                        due_date: dueDate,
                        planned_position: position,
                    })
                    .eq('id', task.id)
                    .eq('user_id', task.user_id)
                    .select('*')
                    .single();

                if (error) throw error;

                if (!isCurrentSession()) {
                    return;
                }

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                if (isCurrentSession()) {
                    // Restore the scheduling properties if saving fails.
                    this.tasks.update((tasks) =>
                        tasks.map((current) =>
                            current.id === task.id
                                ? {
                                      ...current,
                                      due_date: previousDate,
                                      planned_position: previousPosition,
                                  }
                                : current,
                        ),
                    );
                }

                throw error;
            }
        });
    }

    async toggleDone(task: Task): Promise<void> {
        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            const previousIsDone = currentTask.is_done;
            const previousStatus = currentTask.status;

            const isDone = !currentTask.is_done;
            const status = isDone ? 'done' : 'todo';

            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id ? { ...current, is_done: isDone, status } : current,
                ),
            );

            try {
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({ is_done: isDone, status })
                    .eq('id', task.id)
                    .eq('user_id', task.user_id)
                    .select('*')
                    .single();

                if (error) throw error;

                if (!isCurrentSession()) {
                    return;
                }

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                if (isCurrentSession()) {
                    this.tasks.update((tasks) =>
                        tasks.map((current) =>
                            current.id === task.id
                                ? {
                                      ...current,
                                      is_done: previousIsDone,
                                      status: previousStatus,
                                  }
                                : current,
                        ),
                    );
                }

                throw error;
            }
        });
    }

    private async reconcileTask(taskId: string): Promise<void> {
        const generationAtStart = this.sessionGeneration;
        const userIdAtStart = this.auth.userId();
        const task = this.tasks().find((current) => current.id === taskId);

        if (!task) return;

        // Remember the revision when this query begins.
        const revisionAtStart = this.taskRevisions.get(taskId) ?? 0;

        const { data, error } = await this.supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .eq('user_id', task.user_id)
            .single();

        if (error) throw error;

        if (generationAtStart !== this.sessionGeneration || userIdAtStart !== this.auth.userId()) return;

        // If another local mutation started, don't overwrite it.
        if (this.pendingTaskIds.has(taskId)) {
            this.tasksNeedingReconciliation.add(taskId);
            return;
        }

        // If Realtime delivered another update during this query,
        // the response might represent an older database snapshot.
        const currentRevision = this.taskRevisions.get(taskId) ?? 0;

        if (currentRevision !== revisionAtStart) {
            return;
        }

        this.markTaskChanged(taskId);
        this.tasks.update((tasks) =>
            tasks.map((current) => (current.id === taskId ? (data as Task) : current)),
        );
    }

    async remove(taskId: string): Promise<void> {
        await this.runMutation(taskId, async (isCurrentSession) => {
            const tasks = this.tasks();
            const originalIndex = tasks.findIndex((task) => task.id === taskId);

            if (originalIndex === -1) {
                throw new Error('Task no longer exists');
            }

            const deletedTask = tasks[originalIndex];

            // Optimistically remove only the requested task.
            this.tasks.update((current) => current.filter((task) => task.id !== taskId));

            try {
                const { error } = await this.supabase
                    .from('tasks')
                    .delete()
                    .eq('id', taskId)
                    .eq('user_id', deletedTask.user_id);

                if (error) {
                    throw error;
                }
            } catch (error) {
                // Never restore an old user's task after a session change.
                if (isCurrentSession()) {
                    this.tasks.update((current) => {
                        // Avoid duplicates if the task was already restored.
                        if (current.some((task) => task.id === taskId)) {
                            return current;
                        }

                        const restored = [...current];

                        // Restore the task to its approximate original position
                        // without overwriting changes to other tasks.
                        const insertionIndex = Math.min(originalIndex, restored.length);

                        restored.splice(insertionIndex, 0, deletedTask);

                        return restored;
                    });
                }

                throw error;
            }
        });
    }
}

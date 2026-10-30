/** ToDo:
    [] Split repository/data-access concerns from application state
*/
import { Injectable, effect, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
// import { supabase } from '@/shared/supabase/supabase.client';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';
import type { TaskStatus, Task } from '@/features/tasks/models/tasks.model';

import type { TaskOrderField } from '@/features/tasks/utils/task-ordering.util';

import {
    getNextTaskPosition,
    getTaskPlanningContext,
} from '@/features/tasks/utils/task-ordering.util';

// Type for inserting a new task
type NewTaskInsert = {
    user_id: string;
    title: string;
};

// ?
type AddTaskInput = {
    title: string;
    description: string | null;
    projectId: string | null; // not used yet
};

@Injectable({ providedIn: 'root' })
export class TasksStore {
    readonly tasks = signal<Task[]>([]); // What Tasks are currently available?
    private readonly supabase = inject(SUPABASE_CLIENT);
    readonly loading = signal(false); // Are we fetching them?
    readonly creating = signal(false); // Are we in the process of creating a new task (showing the form)?
    readonly mutating = signal(false); // Are we performing a mutation (add, update, delete) on the server?
    private readonly pendingTaskIds = new Set<string>();
    private readonly taskMutationQueues = new Map<string, Promise<void>>();
    private readonly tasksNeedingReconciliation = new Set<string>();
    private readonly taskRevisions = new Map<string, number>();
    private sessionGeneration = 0;
    readonly error = signal<string | null>(null); // Did fetching or mutating fail?

    readonly realtimeConnected = signal(false);

    private channel: RealtimeChannel | null = null;

    private async runMutation<T>(
        taskId: string,
        fn: (isCurrentSession: () => boolean) => Promise<T>,
    ): Promise<T> {
        // Capture the session when the mutation is requested.
        const generationAtStart = this.sessionGeneration;

        const isCurrentSession = () => generationAtStart === this.sessionGeneration;

        const previous = this.taskMutationQueues.get(taskId) ?? Promise.resolve();

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

                return fn(isCurrentSession);
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
            this.tasksNeedingReconciliation.clear();
            this.taskRevisions.clear();

            this.mutating.set(false);
            this.creating.set(false);
            this.loading.set(false);
            this.error.set(null);

            // Always tear down prior subscription when user changes/logs out
            this.teardownRealtime();

            // If no user, clear tasks and mark realtime as disconnected
            if (!userId) {
                this.tasks.set([]);
                this.realtimeConnected.set(false);
                return;
            }

            // Load current state once
            void this.refreshTasks().catch(() => {
                // refreshTasks() has already recorded the error in this.error.
            });

            // Start realtime subscription scoped to this user
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
                    (payload) => this.onTasksChange(payload),
                )
                .subscribe((status, error) => {
                    this.realtimeConnected.set(status === 'SUBSCRIBED');
                });

            onCleanup(() => this.teardownRealtime());
        });
    }

    private teardownRealtime() {
        if (this.channel) {
            void this.supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }

    // Payload typing is annoyingly loose in supabase-js; we’re keeping it safe for now ...
    private onTasksChange(payload: any) {
        const eventType: string = payload.eventType;

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const row = payload.new as Task;
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

        this.tasks.update((tasks) => {
            const index = tasks.findIndex((current) => current.id === row.id);

            if (index >= 0) {
                const next = [...tasks];
                next[index] = row;

                return this.sortDesc(next);
            }

            return this.sortDesc([...tasks, row]);
        });
    }

    private removeFromRealtime(id: string): void {
        this.markTaskChanged(id);

        this.tasks.update((tasks) => tasks.filter((task) => task.id !== id));
    }

    private sortDesc(list: Task[]) {
        // return [...list].sort(
        // (a, b) =>
        //  b.created_at.localeCompare(a.created_at));
        return [...list].sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
        );
    }

    async refreshTasks(): Promise<void> {
        const generationAtStart = this.sessionGeneration;

        // Snapshot the revisions when this particular query starts.
        const revisionsAtStart = new Map(this.taskRevisions);

        this.loading.set(true);
        this.error.set(null);

        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false })
                .order('id', { ascending: true });

            if (error) throw error;

            // The user signed out or switched accounts while this
            // request was pending. Discard the response.
            if (generationAtStart !== this.sessionGeneration) {
                return;
            }

            const fetchedTasks = (data ?? []) as Task[];

            this.tasks.update((currentTasks) => {
                const currentById = new Map(currentTasks.map((task) => [task.id, task]));

                const merged = new Map<string, Task>();

                for (const fetched of fetchedTasks) {
                    const previousRevision = revisionsAtStart.get(fetched.id) ?? 0;

                    const currentRevision = this.taskRevisions.get(fetched.id) ?? 0;

                    const changedDuringRefresh = previousRevision !== currentRevision;

                    const isPending = this.pendingTaskIds.has(fetched.id);

                    if (changedDuringRefresh || isPending) {
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
                        merged.set(current.id, current);
                    }
                }

                return this.sortDesc([...merged.values()]);
            });
        } catch (error: unknown) {
            this.error.set(error instanceof Error ? error.message : 'Failed to load tasks');

            throw error;
        } finally {
            this.loading.set(false);
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

        const projectPosition = getNextTaskPosition(projectTasks, 'project_position');

        // New tasks currently have no planned_date or due_date.
        // Therefore, they enter the Unscheduled planning context.
        const unscheduledTasks = existingTasks.filter(
            (task) => getTaskPlanningContext(task) === 'unscheduled',
        );

        const plannedPosition = getNextTaskPosition(unscheduledTasks, 'planned_position');

        this.error.set(null);
        this.creating.set(true);

        const tempId = crypto.randomUUID();

        const optimistic: Task = {
            id: tempId,
            user_id: userId,
            project_id: input.projectId,

            title: input.title,
            is_done: false,

            description: input.description,

            planned_date: null,
            due_date: null,
            due_at: null,

            project_position: projectPosition,
            planned_position: plannedPosition,

            status: 'todo',

            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        // Protect this temporary task from refresh results
        // until the insert has completed.
        this.pendingTaskIds.add(tempId);
        this.markTaskChanged(tempId);

        this.tasks.update((prev) => [optimistic, ...prev]);

        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .insert({
                    user_id: userId,
                    title: input.title,
                    description: input.description,
                    project_id: input.projectId,
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

            this.tasks.update((prev) =>
                prev.map((task) => (task.id === tempId ? (data as Task) : task)),
            );
        } catch (e: unknown) {
            if (isCurrentSession()) {
                // Remove the failed optimistic task.
                this.tasks.update((prev) => prev.filter((task) => task.id !== tempId));

                this.error.set(e instanceof Error ? e.message : 'Failed to create task');
            }

            throw e;
        } finally {
            if (isCurrentSession()) {
                this.pendingTaskIds.delete(tempId);
                this.creating.set(false);
            }
        }
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
        const trimmed = (description ?? '').trim();
        const normalized = trimmed || null;

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

    async updatePlannedDate(task: Task, plannedDate: string | null): Promise<void> {
        await this.runMutation(task.id, async (isCurrentSession) => {
            const currentTask = this.tasks().find((current) => current.id === task.id);

            if (!currentTask) {
                throw new Error('Task no longer exists');
            }

            if (currentTask.planned_date === plannedDate) {
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

            const position =
                destinationContext === currentContext && previousPosition !== null
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

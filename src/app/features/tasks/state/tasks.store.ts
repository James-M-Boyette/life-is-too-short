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
    readonly error = signal<string | null>(null); // Did fetching or mutating fail?

    readonly realtimeConnected = signal(false);

    private channel: RealtimeChannel | null = null;

    private async runMutation<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
        const previous = this.taskMutationQueues.get(taskId) ?? Promise.resolve();

        // Queue the next operation regardless of whether the previous
        // operation succeeded or failed.
        const operation = previous
            .catch(() => undefined)
            .then(async () => {
                this.error.set(null);

                return fn();
            });

        // Track the operation's completion without leaving a rejected
        // Promise in the queue.
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
            this.error.set(error instanceof Error ? error.message : 'Failed to update task');

            throw error;
        } finally {
            if (this.taskMutationQueues.get(taskId) === settled) {
                this.taskMutationQueues.delete(taskId);
                this.pendingTaskIds.delete(taskId);

                if (this.tasksNeedingReconciliation.delete(taskId)) {
                    try {
                        await this.reconcileTask(taskId);
                    } catch (error) {
                        console.error('Failed to reconcile task after Realtime update:', error);
                    }
                }
            }

            this.mutating.set(this.taskMutationQueues.size > 0);
        }
    }

    constructor(private readonly auth: AuthStore) {
        // Baseline refresh + realtime subscription lifecycle
        effect((onCleanup) => {
            const userId = this.auth.userId();

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

    private upsertFromRealtime(row: Task) {
        // Guard: Don't overwrite a task while a local mutation is pending.
        if (this.pendingTaskIds.has(row.id)) {
            this.tasksNeedingReconciliation.add(row.id);
            return;
        }

        this.tasks.update((prev) => {
            const idx = prev.findIndex((t) => t.id === row.id);

            // Replace existing
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = row;
                return this.sortDesc(next);
            }

            // Insert new
            return this.sortDesc([row, ...prev]);
        });
    }

    private removeFromRealtime(id: string) {
        this.tasks.update((prev) => prev.filter((t) => t.id !== id));
    }

    private sortDesc(list: Task[]) {
        // return [...list].sort(
        // (a, b) =>
        //  b.created_at.localeCompare(a.created_at));
        return [...list].sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
        );
    }

    async refreshTasks() {
        this.loading.set(true);
        this.error.set(null);
        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false })
                .order('id', { ascending: true });

            if (error) throw error;

            this.tasks.set((data ?? []) as Task[]); // Set tasks from DB (or empty array if null)
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

            this.tasks.update((prev) =>
                prev.map((task) => (task.id === tempId ? (data as Task) : task)),
            );
        } catch (e: unknown) {
            this.tasks.update((prev) => prev.filter((task) => task.id !== tempId));

            this.error.set(e instanceof Error ? e.message : 'Failed to create task');

            throw e;
        } finally {
            this.creating.set(false);
        }
    }

    async updateTitle(task: Task, title: string): Promise<void> {
        const nextTitle = title.trim();

        if (!nextTitle) {
            return;
        }

        await this.runMutation(task.id, async () => {
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

                // Reconcile with the authoritative saved row.
                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                // Roll back only the field this mutation changed.
                this.tasks.update((tasks) =>
                    tasks.map((current) =>
                        current.id === task.id
                            ? {
                                  ...current,
                                  title: previousTitle,
                              }
                            : current,
                    ),
                );

                throw error;
            }
        });
    }

    async updateDescription(task: Task, description: string | null): Promise<void> {
        const trimmed = (description ?? '').trim();
        const normalized = trimmed || null;

        await this.runMutation(task.id, async () => {
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

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                this.tasks.update((tasks) =>
                    tasks.map((current) =>
                        current.id === task.id
                            ? { ...current, description: previousDescription }
                            : current,
                    ),
                );

                throw error;
            }
        });
    }

    async updateTaskPosition(task: Task, field: TaskOrderField, position: number): Promise<void> {
        if (!Number.isFinite(position)) {
            throw new Error('Invalid task position');
        }

        await this.runMutation(task.id, async () => {
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

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                this.tasks.update((tasks) =>
                    tasks.map((current) =>
                        current.id === task.id
                            ? { ...current, [field]: previousPosition }
                            : current,
                    ),
                );

                throw error;
            }
        });
    }

    async updateProject(task: Task, projectId: string | null): Promise<void> {
        await this.runMutation(task.id, async () => {
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

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
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

                throw error;
            }
        });
    }

    async updatePlannedDate(task: Task, plannedDate: string | null): Promise<void> {
        await this.runMutation(task.id, async () => {
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

                if (error) {
                    throw error;
                }

                // Reconcile with the saved row.
                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
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

                throw error;
            }
        });
    }

    async updateDueDate(task: Task, dueDate: string | null): Promise<void> {
        await this.runMutation(task.id, async () => {
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

                if (error) {
                    throw error;
                }

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
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

                throw error;
            }
        });
    }

    async toggleDone(task: Task): Promise<void> {
        await this.runMutation(task.id, async () => {
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

                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
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

                throw error;
            }
        });
    }

    private async reconcileTask(taskId: string): Promise<void> {
        const task = this.tasks().find((current) => current.id === taskId);

        if (!task) return;

        const { data, error } = await this.supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .eq('user_id', task.user_id)
            .single();

        if (error) throw error;

        // Another local mutation might have started while
        // the reconciliation query was in progress.
        if (this.pendingTaskIds.has(taskId)) {
            this.tasksNeedingReconciliation.add(taskId);
            return;
        }

        this.tasks.update((tasks) =>
            tasks.map((current) => (current.id === taskId ? (data as Task) : current)),
        );
    }

    async remove(taskId: string) {
        await this.runMutation(taskId, async () => {
            const prev = this.tasks();
            this.tasks.update((list) => list.filter((t) => t.id !== taskId));

            const { error } = await this.supabase.from('tasks').delete().eq('id', taskId);

            if (error) {
                this.tasks.set(prev);
                throw error;
            }
        });
    }
}

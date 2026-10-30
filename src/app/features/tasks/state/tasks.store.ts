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
    readonly error = signal<string | null>(null); // Did fetching or mutating fail?

    readonly realtimeConnected = signal(false);

    private channel: RealtimeChannel | null = null;

    private async runMutation<T>(fn: () => Promise<T>): Promise<T> {
        this.error.set(null);
        this.mutating.set(true);
        try {
            return await fn();
        } catch (e: unknown) {
            this.error.set(e instanceof Error ? e.message : 'Failed to load tasks');
            throw e;
        } finally {
            this.mutating.set(false);
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
                // .subscribe((status) => {
                //     this.realtimeConnected.set(status === 'SUBSCRIBED');
                // });
                .subscribe((status, error) => {
                    this.realtimeConnected.set(status === 'SUBSCRIBED');

                    // console.log('[Tasks Realtime]', {
                    //     status,
                    //     errorMessage: error?.message ?? null,
                    // });
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
            // const { data, error } = await this.supabase
            //     .from('tasks')
            //     .select('*')
            //     .order('created_at', { ascending: false });
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

    async updateTitle(task: Task, title: string) {
        const nextTitle = title.trim();
        if (!nextTitle || nextTitle === task.title) return;

        await this.runMutation(async () => {
            const next: Task = {
                ...task,
                title: nextTitle,
                updated_at: new Date().toISOString(), // optimistic; DB will overwrite
            };

            // optimistic
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? next : t)));

            const { data, error } = await this.supabase
                .from('tasks')
                .update({ title: nextTitle })
                .eq('id', task.id)
                .select('*')
                .single();

            if (error) {
                // revert
                this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? task : t)));
                throw error;
            }

            // reconcile with DB row (true updated_at)
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? (data as Task) : t)));
        });
    }

    async updateDescription(task: Task, description: string | null) {
        const nextDescription = (description ?? '').trim();
        const normalized = nextDescription.length ? nextDescription : null;

        if (normalized === task.description) return;

        await this.runMutation(async () => {
            const next: Task = {
                ...task,
                description: normalized,
                updated_at: new Date().toISOString(), // optimistic
            };

            // optimistic
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? next : t)));

            const { data, error } = await this.supabase
                .from('tasks')
                .update({ description: normalized })
                .eq('id', task.id)
                .select('*')
                .single();

            if (error) {
                // revert
                this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? task : t)));
                throw error;
            }

            // reconcile
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? (data as Task) : t)));
        });
    }

    async updateTaskPosition(task: Task, field: TaskOrderField, position: number): Promise<void> {
        // Don't make unnecessary database requests.
        if (task[field] === position) {
            return;
        }

        // Reject invalid positions before updating local state.
        if (!Number.isFinite(position)) {
            throw new Error('Invalid task position');
        }

        await this.runMutation(async () => {
            const previousPosition = task[field];

            // 1. Optimistically update the task in our signal.
            this.tasks.update((tasks) =>
                tasks.map((current) =>
                    current.id === task.id
                        ? {
                              ...current,
                              [field]: position,
                          }
                        : current,
                ),
            );

            try {
                // 2. Persist the position to Supabase.
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update({ [field]: position })
                    .eq('id', task.id)
                    .eq('user_id', task.user_id)
                    .select('*')
                    .single();

                if (error) {
                    throw error;
                }

                // 3. Reconcile with the saved database record.
                this.tasks.update((tasks) =>
                    tasks.map((current) => (current.id === task.id ? (data as Task) : current)),
                );
            } catch (error) {
                // 4. Restore the previous position if persistence fails.
                this.tasks.update((tasks) =>
                    tasks.map((current) =>
                        current.id === task.id
                            ? {
                                  ...current,
                                  [field]: previousPosition,
                              }
                            : current,
                    ),
                );

                throw error;
            }
        });
    }

    async updateProject(task: Task, projectId: string | null): Promise<void> {
        if (projectId === task.project_id) {
            return;
        }

        await this.runMutation(async () => {
            const previousProjectId = task.project_id;
            const previousPosition = task.project_position;

            // Find the tasks already belonging to the destination project.
            // A null project ID represents Inbox.
            const destinationTasks = this.tasks().filter(
                (current) =>
                    current.id !== task.id &&
                    current.user_id === task.user_id &&
                    current.project_id === projectId,
            );

            // Append the transferred task after existing tasks.
            const position = getNextTaskPosition(destinationTasks, 'project_position');

            // Optimistically update both related properties.
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
                // Restore both properties if the database request fails.
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
        if (plannedDate === task.planned_date) {
            return;
        }

        await this.runMutation(async () => {
            // Keep a snapshot of the task's previous scheduling state.
            const previousDate = task.planned_date;
            const previousPosition = task.planned_position;

            // Determine the context the task will enter.
            // If plannedDate is cleared, due_date may still determine
            // its effective date (including an overdue date).
            const destinationTask: Task = {
                ...task,
                planned_date: plannedDate,
            };

            const destinationContext = getTaskPlanningContext(destinationTask);

            const currentContext = getTaskPlanningContext(task);

            // Only assign a new position when the effective
            // planning context actually changes.
            const position =
                destinationContext === currentContext && previousPosition !== null
                    ? previousPosition
                    : getNextTaskPosition(
                          this.tasks().filter(
                              (current) =>
                                  current.id !== task.id &&
                                  current.user_id === task.user_id &&
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
        if (dueDate === task.due_date) {
            return;
        }

        await this.runMutation(async () => {
            const previousDate = task.due_date;
            const previousPosition = task.planned_position;

            // Preview the task after its due date changes.
            const destinationTask: Task = {
                ...task,
                due_date: dueDate,
            };

            // A planned date takes precedence over the due date.
            const currentContext = getTaskPlanningContext(task);
            const destinationContext = getTaskPlanningContext(destinationTask);

            // Preserve the existing position if the task stays
            // in the same planning context.
            // Otherwise, append it to the destination context.
            const position =
                currentContext === destinationContext && previousPosition !== null
                    ? previousPosition
                    : getNextTaskPosition(
                          this.tasks().filter(
                              (current) =>
                                  current.id !== task.id &&
                                  current.user_id === task.user_id &&
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
                const { data, error } =  await this.supabase
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

    async toggleDone(task: Task) {
        await this.runMutation(async () => {
            const isDone = !task.is_done;
            const next: Task = {
                ...task,
                is_done: isDone,
                status: isDone ? 'done' : 'todo',
                // updated_at will be set by DB; we can set optimistic too
                updated_at: new Date().toISOString(),
            };

            // optimistic update
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? next : t)));

            const { data, error } = await this.supabase
                .from('tasks')
                .update({ is_done: next.is_done, status: next.status })
                .eq('id', task.id)
                .select('*')
                .single();

            if (error) {
                // revert
                this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? task : t)));
                throw error;
            }

            // reconcile with DB row (real updated_at)
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? (data as Task) : t)));
        });
    }

    async remove(taskId: string) {
        await this.runMutation(async () => {
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

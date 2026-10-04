/** ToDo:
    [] Split repository/data-access concerns from application state
*/
import { Injectable, effect, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';
import type { TaskStatus, Task } from '@/features/tasks/models/tasks.model';

// Type for inserting a new task
type NewTaskInsert = {
    user_id: string;
    title: string;
};

// ?
type AddTaskInput = {
    title: string;
    notes: string | null;
    projectId: string | null; // not used yet
};

@Injectable({ providedIn: 'root' })
export class TasksStore {
    readonly tasks = signal<Task[]>([]); // What Tasks are currently available?
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
            void this.refreshTasks();

            // Start realtime subscription scoped to this user
            this.channel = supabase
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
                .subscribe((status) => {
                    this.realtimeConnected.set(status === 'SUBSCRIBED');
                });

            onCleanup(() => this.teardownRealtime());
        });
    }

    private teardownRealtime() {
        if (this.channel) {
            void supabase.removeChannel(this.channel);
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
        return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    async refreshTasks() {
        this.loading.set(true);
        this.error.set(null);
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.tasks.set((data ?? []) as Task[]); // Set tasks from DB (or empty array if null)
        } catch (e: any) {
            this.error.set(e?.message ?? 'Failed to load tasks');
        } finally {
            this.loading.set(false);
        }
    }

    async addTask(input: AddTaskInput) {
        const userId = this.auth.userId();

        if (!userId) throw new Error(`✋⛔ User not authenticated`);

        this.error.set(null);
        this.creating.set(true);

        const tempId = crypto.randomUUID();

        const optimistic: Task = {
            id: tempId,
            user_id: userId,
            project_id: input.projectId,

            title: input.title,
            is_done: false,

            notes: input.notes,
            due_at: null,

            status: 'todo',

            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        this.tasks.update((prev) => [optimistic, ...prev]);

        try {
            const { data, error } = await supabase
                .from('tasks')
                .insert({
                    user_id: userId,
                    title: input.title,
                    notes: input.notes,
                    project_id: input.projectId,
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

            const { data, error } = await supabase
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

    async updateNotes(task: Task, notes: string | null) {
        const nextNotes = (notes ?? '').trim();
        const normalized = nextNotes.length ? nextNotes : null;

        if (normalized === task.notes) return;

        await this.runMutation(async () => {
            const next: Task = {
                ...task,
                notes: normalized,
                updated_at: new Date().toISOString(), // optimistic
            };

            // optimistic
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? next : t)));

            const { data, error } = await supabase
                .from('tasks')
                .update({ notes: normalized })
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

    async updateProject(task: Task, projectId: string | null) {
        if (projectId === task.project_id) {
            return;
        }

        await this.runMutation(async () => {
            const next: Task = {
                ...task,
                project_id: projectId,
                updated_at: new Date().toISOString(),
            };

            // Optimistic update
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? next : t)));

            const { data, error } = await supabase
                .from('tasks')
                .update({
                    project_id: projectId,
                })
                .eq('id', task.id)
                .select('*')
                .single();

            if (error) {
                // Roll back
                this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? task : t)));

                throw error;
            }

            // Reconcile with DB
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? (data as Task) : t)));
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

            const { data, error } = await supabase
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

            const { error } = await supabase.from('tasks').delete().eq('id', taskId);

            if (error) {
                this.tasks.set(prev);
                throw error;
            }
        });
    }
}

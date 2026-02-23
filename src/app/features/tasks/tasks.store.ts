import { Injectable, effect, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';

export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'deferred' | 'cancelled' | 'done';

export type Task = {
    id: string;
    user_id: string;
    title: string;

    is_done: boolean;

    notes: string | null;
    due_at: string | null;

    status: TaskStatus;

    created_at: string;
    updated_at: string;
};

type NewTaskInsert = {
    user_id: string;
    title: string;
};

@Injectable({ providedIn: 'root' })
export class TasksStore {
    readonly loading = signal(false);
    readonly mutating = signal(false);
    readonly tasks = signal<Task[]>([]);
    readonly error = signal<string | null>(null);

    readonly realtimeConnected = signal(false);

    private channel: RealtimeChannel | null = null;

    private async runMutation<T>(fn: () => Promise<T>): Promise<T> {
        this.error.set(null);
        this.mutating.set(true);
        try {
            return await fn();
        } catch (e: any) {
            this.error.set(e?.message ?? 'Operation failed');
            throw e;
        } finally {
            this.mutating.set(false);
        }
    }

    constructor(private readonly auth: AuthStore) {
        // effect(() => {
        //     if (this.auth.isAuthed()) void this.refresh();
        //     else this.tasks.set([]);
        // });
        // Baseline refresh + realtime subscription lifecycle
        effect((onCleanup) => {
            const userId = this.auth.userId();

            // Always tear down prior subscription when user changes/logs out
            this.teardownRealtime();

            if (!userId) {
                this.tasks.set([]);
                this.realtimeConnected.set(false);
                return;
            }

            // Load current state once
            void this.refresh();

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

    // payload typing is annoyingly loose in supabase-js; we’ll keep it safe:
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

    async refresh() {
        this.loading.set(true);
        this.error.set(null);
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.tasks.set((data ?? []) as Task[]);
        } catch (e: any) {
            this.error.set(e?.message ?? 'Failed to load tasks');
        } finally {
            this.loading.set(false);
        }
    }

    async add(title: string) {
        const userId = this.auth.userId();
        if (!userId) throw new Error('Not authenticated');

        await this.runMutation(async () => {
            const tempId = crypto.randomUUID();

            const optimistic: Task = {
                id: tempId,
                user_id: userId,
                title,
                is_done: false,

                notes: null,
                due_at: null,

                status: 'todo',

                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            this.tasks.update((prev) => [optimistic, ...prev]);

            const { data, error } = await supabase
                .from('tasks')
                .insert({ user_id: userId, title } satisfies NewTaskInsert)
                .select('*')
                .single();

            if (error) {
                this.tasks.update((prev) => prev.filter((t) => t.id !== tempId));
                throw error;
            }

            this.tasks.update((prev) => prev.map((t) => (t.id === tempId ? (data as Task) : t)));
        });
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

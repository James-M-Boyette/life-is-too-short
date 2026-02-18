import { Injectable, effect, signal } from '@angular/core';
import { supabase } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';

export type Task = {
    id: string;
    user_id: string;
    title: string;
    is_done: boolean;
    created_at: string;
};

type NewTaskInsert = {
    user_id: string;
    title: string;
};

@Injectable({ providedIn: 'root' })
export class TasksStore {
    readonly loading = signal(false);
    readonly tasks = signal<Task[]>([]);
    readonly error = signal<string | null>(null);

    constructor(private readonly auth: AuthStore) {
        effect(() => {
            if (this.auth.isAuthed()) void this.refresh();
            else this.tasks.set([]);
        });
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

        // Optimistic task (temporary id)
        const tempId = crypto.randomUUID();
        const optimistic: Task = {
            id: tempId,
            user_id: userId,
            title,
            is_done: false,
            created_at: new Date().toISOString(),
        };

        this.tasks.update((prev) => [optimistic, ...prev]);

        const { data, error } = await supabase
            .from('tasks')
            .insert({ user_id: userId, title } satisfies NewTaskInsert)
            .select('*')
            .single();

        if (error) {
            // revert
            this.tasks.update((prev) => prev.filter((t) => t.id !== tempId));
            throw error;
        }

        // replace optimistic with real row
        this.tasks.update((prev) => prev.map((t) => (t.id === tempId ? (data as Task) : t)));
    }

    async toggleDone(task: Task) {
        // optimistic toggle
        const next = { ...task, is_done: !task.is_done };
        this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? next : t)));

        const { error } = await supabase
            .from('tasks')
            .update({ is_done: next.is_done })
            .eq('id', task.id);

        if (error) {
            // revert
            this.tasks.update((prev) => prev.map((t) => (t.id === task.id ? task : t)));
            throw error;
        }
    }

    async remove(taskId: string) {
        // optimistic delete
        const prev = this.tasks();
        this.tasks.update((list) => list.filter((t) => t.id !== taskId));

        const { error } = await supabase.from('tasks').delete().eq('id', taskId);

        if (error) {
            // revert
            this.tasks.set(prev);
            throw error;
        }
    }
}

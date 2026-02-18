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

@Injectable({ providedIn: 'root' })
export class TasksStore {
    readonly loading = signal(false);
    readonly tasks = signal<Task[]>([]);

    constructor(private readonly auth: AuthStore) {
        effect(() => {
            if (this.auth.isAuthed()) void this.refresh();
            else this.tasks.set([]);
        });
    }

    async refresh() {
        this.loading.set(true);
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.tasks.set((data ?? []) as Task[]);
        } finally {
            this.loading.set(false);
        }
    }

    async add(title: string) {
        const userId = this.auth.userId();
        if (!userId) throw new Error('Not authenticated');

        const { error } = await supabase.from('tasks').insert({ user_id: userId, title });
        if (error) throw error;

        await this.refresh();
    }

    async toggleDone(task: Task) {
        const { error } = await supabase
            .from('tasks')
            .update({ is_done: !task.is_done })
            .eq('id', task.id);

        if (error) throw error;
        await this.refresh();
    }

    async remove(taskId: string) {
        const { error } = await supabase.from('tasks').delete().eq('id', taskId);
        if (error) throw error;

        await this.refresh();
    }
}

import { Injectable, signal } from '@angular/core';
import type { TaskCreateContext } from '../models/task-create-context.model';

@Injectable()
export class TaskCreateDialogService {
    readonly context = signal<TaskCreateContext | null>(null);

    open(context: TaskCreateContext): void {
        if (this.context() !== null) {
            return;
        }

        this.context.set({ ...context });
    }

    close(): void {
        this.context.set(null);
    }
}

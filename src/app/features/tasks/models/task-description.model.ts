import type { Task } from './tasks.model';

export interface TaskDescriptionChange {
    task: Task;
    description: string | null;
}

export interface TaskDescriptionFeedback {
    attemptId: number;
    pending: boolean;
    error: string | null;
}

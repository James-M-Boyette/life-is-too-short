import type { Task } from './tasks.model';

export interface TaskContentChange {
    task: Task;
    title: string;
    description: string | null;
}

export interface TaskContentFeedback {
    attemptId: number;
    pending: boolean;
    error: string | null;
}

export type TaskContent = Pick<Task, 'title' | 'description'>;

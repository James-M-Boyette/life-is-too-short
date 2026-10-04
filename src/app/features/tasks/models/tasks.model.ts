// What state(s) can a task have?
export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'deferred' | 'cancelled' | 'done';

// What makes-up a "Task"?
export type Task = {
    id: string;
    user_id: string;
    project_id: string | null;

    title: string;
    is_done: boolean;
    notes: string | null;
    due_at: string | null;
    status: TaskStatus;

    created_at: string;
    updated_at: string;
};

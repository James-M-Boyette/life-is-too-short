// What state(s) can a task have?
export type TaskStatus =
    'todo' |
    'in_progress' |
    'waiting' |
    'deferred' |
    'cancelled' |
    'done';

// What makes-up a "Task"?
export type Task = {
    id: string;
    user_id: string;
    project_id: string | null;

    title: string;
    is_done: boolean;
    description: string | null;

    planned_date: string | null;
    due_date: string | null;
    due_at: string | null;

    project_position: number | null;
    planned_position: number | null;

    status: TaskStatus;

    created_at: string;
    updated_at: string;
};

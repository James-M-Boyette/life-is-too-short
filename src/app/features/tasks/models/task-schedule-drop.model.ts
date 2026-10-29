import type { Task } from './tasks.model';

export type TaskScheduleDrop = {
    task: Task;
    plannedDate: string | null;
};

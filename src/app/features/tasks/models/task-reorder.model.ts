import type { Task } from './tasks.model';

export type TaskReorder = {
    task: Task;
    previousIndex: number;
    currentIndex: number;
    tasks: Task[];
};

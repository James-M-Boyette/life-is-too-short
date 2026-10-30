import type { Task } from './tasks.model';
import type { TaskOrderField } from '@/features/tasks/utils/task-ordering.util';

export type TaskReorder = {
    task: Task;
    previousIndex: number;
    currentIndex: number;
    tasks: Task[];
    field: TaskOrderField;
};

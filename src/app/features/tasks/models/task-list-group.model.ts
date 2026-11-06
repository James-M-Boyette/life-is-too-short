import type { Task } from './tasks.model';

/** Optional visual sections within one task drop list. */
export interface TaskListGroup {
    id: string;
    label: string;
    tasks: Task[];
}

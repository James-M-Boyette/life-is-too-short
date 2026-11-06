import type { Task } from './tasks.model';

export interface TaskPlanningPlacement {
    previousTaskId: string | null;
    nextTaskId: string | null;
}

export type TaskScheduleDrop = {
    task: Task;
    plannedDate: string | null;
    placement?: TaskPlanningPlacement;
};

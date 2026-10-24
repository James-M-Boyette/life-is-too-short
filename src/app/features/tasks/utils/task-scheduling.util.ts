import type { Task } from '@/features/tasks/models/tasks.model';

export type TaskDateGroup = 'today' | 'unscheduled' | 'overdue' | 'future';

export function getTaskDisplayDate(task: Task): string | null {
    return task.planned_date ?? task.due_date;
}

export function getTaskDateGroup(
    task: Task,
    today: string,
): TaskDateGroup {
    const displayDate = getTaskDisplayDate(task);

    if (!displayDate) return 'unscheduled';
    if (displayDate < today) return 'overdue';
    if (displayDate === today) return 'today';

    return 'future';
}

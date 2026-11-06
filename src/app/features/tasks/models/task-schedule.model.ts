export type TaskDateField = 'planned_date' | 'due_date';

export interface TaskDateSelection {
    field: TaskDateField;
    date: string | null;
}

export interface TaskScheduleRequest {
    taskId: string;
    event: Event;
    anchor: HTMLElement;
}

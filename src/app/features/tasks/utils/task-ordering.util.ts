import type { Task } from '@/features/tasks/models/tasks.model';
import { getTaskDisplayDate } from './task-scheduling.util';

export type TaskOrderField = 'project_position' | 'planned_position';

const POSITION_STEP = 1000;

export function sortTasksByPosition(tasks: Task[], field: TaskOrderField): Task[] {
    return [...tasks].sort((a, b) => {
        const aPosition = a[field];
        const bPosition = b[field];

        // Unpositioned tasks appear after positioned tasks.
        if (aPosition === null && bPosition !== null) return 1;
        if (aPosition !== null && bPosition === null) return -1;

        if (aPosition !== null && bPosition !== null) {
            const difference = aPosition - bPosition;

            if (difference !== 0) return difference;
        }

        // Deterministic fallback.
        return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
    });
}

export function calculateTaskPosition(previous: number | null, next: number | null): number {
    if (previous === null && next === null) {
        return POSITION_STEP;
    }

    if (previous === null) {
        return next! - POSITION_STEP;
    }

    if (next === null) {
        return previous + POSITION_STEP;
    }

    if (previous >= next) {
        throw new Error('Invalid ordering boundaries');
    }

    const midpoint = previous + (next - previous) / 2;

    if (midpoint === previous || midpoint === next) {
        throw new Error('Task positions require rebalancing');
    }

    return midpoint;
}

export function getTaskPlanningContext(task: Task): string {
    return getTaskDisplayDate(task) ?? 'unscheduled';
}

export function getFirstTaskPosition(tasks: Task[], field: TaskOrderField): number {
    const positions = tasks
        .map((task) => task[field])
        .filter((position): position is number => position !== null);

    if (positions.length === 0) {
        return POSITION_STEP;
    }

    return Math.min(...positions) - POSITION_STEP;
}

export function getNextTaskPosition(tasks: Task[], field: TaskOrderField): number {
    const positions = tasks
        .map((task) => task[field])
        .filter((position): position is number => position !== null);

    if (positions.length === 0) {
        return POSITION_STEP;
    }

    return Math.max(...positions) + POSITION_STEP;
}

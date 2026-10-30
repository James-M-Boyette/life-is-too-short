import { describe, expect, it } from 'vitest';

import {
    calculateTaskPosition,
    getFirstTaskPosition,
    getNextTaskPosition,
    getTaskPlanningContext,
    sortTasksByPosition,
} from './task-ordering.util';

import type { Task } from '@/features/tasks/models/tasks.model';

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: 'task-1',
        user_id: 'user-1',
        project_id: null,
        title: 'Test task',
        description: null,
        status: 'todo',
        is_done: false,
        planned_date: null,
        due_date: null,
        due_at: null,
        project_position: 1000,
        planned_position: 1000,
        created_at: '2026-10-29T12:00:00Z',
        updated_at: '2026-10-29T12:00:00Z',
        ...overrides,
    };
}

describe('calculateTaskPosition', () => {
    it('assigns an initial position', () => {
        expect(calculateTaskPosition(null, null)).toBe(1000);
    });

    it('places a task before the first task', () => {
        expect(calculateTaskPosition(null, 1000)).toBe(0);
    });

    it('places a task after the last task', () => {
        expect(calculateTaskPosition(3000, null)).toBe(4000);
    });

    it('places a task between two tasks', () => {
        expect(calculateTaskPosition(1000, 2000)).toBe(1500);
    });

    it('rejects reversed ordering boundaries', () => {
        expect(() => calculateTaskPosition(2000, 1000)).toThrow();
    });

    it('rejects identical ordering boundaries', () => {
        expect(() => calculateTaskPosition(1000, 1000)).toThrow();
    });
});

describe('sortTasksByPosition', () => {
    it('sorts tasks by the requested ordering field', () => {
        const tasks = [
            createTask({
                id: 'a',
                project_position: 3000,
                planned_position: 1000,
            }),
            createTask({
                id: 'b',
                project_position: 1000,
                planned_position: 3000,
            }),
        ];

        expect(
            sortTasksByPosition(tasks, 'project_position')
                .map((task) => task.id),
        ).toEqual(['b', 'a']);

        expect(
            sortTasksByPosition(tasks, 'planned_position')
                .map((task) => task.id),
        ).toEqual(['a', 'b']);
    });

    it('places tasks with null positions last', () => {
        const tasks = [
            createTask({
                id: 'a',
                planned_position: null,
            }),
            createTask({
                id: 'b',
                planned_position: 1000,
            }),
        ];

        expect(
            sortTasksByPosition(tasks, 'planned_position')
                .map((task) => task.id),
        ).toEqual(['b', 'a']);
    });

    it('does not mutate the original array', () => {
        const tasks = [
            createTask({ id: 'a', planned_position: 2000 }),
            createTask({ id: 'b', planned_position: 1000 }),
        ];

        const sorted = sortTasksByPosition(
            tasks,
            'planned_position',
        );

        expect(sorted.map((task) => task.id)).toEqual(['b', 'a']);
        expect(tasks.map((task) => task.id)).toEqual(['a', 'b']);
    });

    it('uses deterministic fallback ordering for equal positions', () => {
        const tasks = [
            createTask({
                id: 'older',
                planned_position: 1000,
                created_at: '2026-10-28T12:00:00Z',
            }),
            createTask({
                id: 'newer',
                planned_position: 1000,
                created_at: '2026-10-29T12:00:00Z',
            }),
        ];

        expect(
            sortTasksByPosition(tasks, 'planned_position')
                .map((task) => task.id),
        ).toEqual(['newer', 'older']);
    });
});

describe('getFirstTaskPosition', () => {
    it('places new tasks before existing tasks', () => {
        const tasks = [
            createTask({ id: 'a', project_position: 1000 }),
            createTask({ id: 'b', project_position: 2000 }),
        ];

        expect(getFirstTaskPosition(tasks, 'project_position')).toBe(0);
    });

    it('supports existing negative positions', () => {
        const tasks = [
            createTask({ id: 'a', planned_position: -1000 }),
            createTask({ id: 'b', planned_position: 1000 }),
        ];

        expect(getFirstTaskPosition(tasks, 'planned_position')).toBe(-2000);
    });

    it('returns the initial position for an empty list', () => {
        expect(getFirstTaskPosition([], 'project_position')).toBe(1000);
    });

    it('ignores null positions', () => {
        const tasks = [
            createTask({ id: 'a', project_position: null }),
            createTask({ id: 'b', project_position: 2000 }),
        ];

        expect(getFirstTaskPosition(tasks, 'project_position')).toBe(1000);
    });
});

describe('getNextTaskPosition', () => {
    it('returns 1000 for an empty list', () => {
        expect(
            getNextTaskPosition([], 'planned_position'),
        ).toBe(1000);
    });

    it('appends after the highest existing position', () => {
        const tasks = [
            createTask({ id: 'a', planned_position: 3000 }),
            createTask({ id: 'b', planned_position: 1000 }),
        ];

        expect(
            getNextTaskPosition(tasks, 'planned_position'),
        ).toBe(4000);
    });

    it('ignores null positions', () => {
        const tasks = [
            createTask({ id: 'a', planned_position: null }),
            createTask({ id: 'b', planned_position: 2000 }),
        ];

        expect(
            getNextTaskPosition(tasks, 'planned_position'),
        ).toBe(3000);
    });
});

describe('getTaskPlanningContext', () => {
    it('returns unscheduled when both dates are null', () => {
        const task = createTask();

        expect(getTaskPlanningContext(task)).toBe('unscheduled');
    });

    it('uses the due date when no planned date exists', () => {
        const task = createTask({
            due_date: '2026-10-30',
        });

        expect(getTaskPlanningContext(task)).toBe('2026-10-30');
    });

    it('prioritizes planned date over due date', () => {
        const task = createTask({
            planned_date: '2026-10-29',
            due_date: '2026-10-30',
        });

        expect(getTaskPlanningContext(task)).toBe('2026-10-29');
    });
});

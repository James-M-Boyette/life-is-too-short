import { describe, expect, it } from 'vitest';
import type { Task } from '@/features/tasks/models/tasks.model';
import { getTaskDateGroup, getTaskDisplayDate } from './task-scheduling.util';

describe('scheduling placement precedence', () => {
    it.each([
        ['2026-11-05', null, '2026-11-05', 'today'],
        [null, '2026-11-05', '2026-11-05', 'today'],
        [null, '2026-11-04', '2026-11-04', 'overdue'],
        ['2026-11-06', '2026-11-04', '2026-11-06', 'future'],
    ])('planned %s and due %s retain their existing placement', (planned_date, due_date, display, group) => {
        const task = { planned_date, due_date } as Task;
        expect(getTaskDisplayDate(task)).toBe(display);
        expect(getTaskDateGroup(task, '2026-11-05')).toBe(group);
    });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksStore } from './tasks.store';
import { AuthStore } from '@/shared/supabase/auth.store';
import type { Task } from '@/features/tasks/models/tasks.model';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';

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

describe('TasksStore', () => {
    let store: TasksStore;
    let single: ReturnType<typeof vi.fn>;
    let from: ReturnType<typeof vi.fn>;
    let update: ReturnType<typeof vi.fn>;
    let eq: ReturnType<typeof vi.fn>;
    let select: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        from = vi.fn();
        update = vi.fn();
        eq = vi.fn();
        select = vi.fn();
        single = vi.fn();

        const query = {
            update,
            eq,
            select,
            single,
        };

        update.mockReturnValue(query);
        eq.mockReturnValue(query);
        select.mockReturnValue(query);

        from.mockReturnValue(query);

        TestBed.configureTestingModule({
            providers: [
                TasksStore,
                {
                    provide: AuthStore,
                    useValue: {
                        userId: signal<string | null>(null),
                    },
                },
                {
                    provide: SUPABASE_CLIENT,
                    useValue: {
                        from,
                    },
                },
            ],
        });

        store = TestBed.inject(TasksStore);
    });

    it('updates project_position without changing planned_position', async () => {
        const task = createTask({
            project_position: 1000,
            planned_position: 2500,
        });

        store.tasks.set([task]);

        single.mockResolvedValue({
            data: {
                ...task,
                project_position: 1500,
            },
            error: null,
        });

        await store.updateTaskPosition(task, 'project_position', 1500);

        expect(update).toHaveBeenCalledExactlyOnceWith({
            project_position: 1500,
        });

        expect(store.tasks()[0].project_position).toBe(1500);
        expect(store.tasks()[0].planned_position).toBe(2500);
    });

    it('persists a new planned position', async () => {
        const task = createTask();

        store.tasks.set([task]);

        const savedTask = {
            ...task,
            planned_position: 1500,
        };

        single.mockResolvedValue({
            data: savedTask,
            error: null,
        });

        await store.updateTaskPosition(task, 'planned_position', 1500);

        expect(update).toHaveBeenCalledExactlyOnceWith({
            planned_position: 1500,
        });

        expect(eq).toHaveBeenCalledWith('id', task.id);
        expect(eq).toHaveBeenCalledWith('user_id', task.user_id);
        expect(single).toHaveBeenCalledOnce();

        expect(store.tasks()[0].planned_position).toBe(1500);
        expect(from).toHaveBeenCalledWith('tasks');
    });

    it('does not persist when the position is unchanged', async () => {
        const task = createTask({
            planned_position: 1000,
        });

        store.tasks.set([task]);

        await store.updateTaskPosition(task, 'planned_position', 1000);

        expect(from).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(store.tasks()[0].planned_position).toBe(1000);
    });

    it('restores the previous position if Supabase fails', async () => {
        const task = createTask();

        store.tasks.set([task]);

        single.mockResolvedValue({
            data: null,
            error: new Error('Database update failed'),
        });

        await expect(store.updateTaskPosition(task, 'planned_position', 1500)).rejects.toThrow(
            'Database update failed',
        );

        expect(store.tasks()[0].planned_position).toBe(1000);
        expect(store.mutating()).toBe(false);
        expect(store.error()).toBe('Database update failed');
    });

    it('appends a transferred task to the destination project', async () => {
        const movingTask = createTask({
            id: 'moving-task',
            project_id: 'project-a',
            project_position: 1000,
            planned_position: 2500,
        });

        const destinationTask = createTask({
            id: 'destination-task',
            project_id: 'project-b',
            project_position: 3000,
        });

        store.tasks.set([movingTask, destinationTask]);

        const savedTask: Task = {
            ...movingTask,
            project_id: 'project-b',
            project_position: 4000,
        };

        single.mockResolvedValue({
            data: savedTask,
            error: null,
        });

        await store.updateProject(movingTask, 'project-b');

        expect(update).toHaveBeenCalledExactlyOnceWith({
            project_id: 'project-b',
            project_position: 4000,
        });

        const result = store.tasks().find((task) => task.id === movingTask.id);

        expect(result?.project_id).toBe('project-b');
        expect(result?.project_position).toBe(4000);

        // Moving between projects shouldn't change scheduling order.
        expect(result?.planned_position).toBe(2500);
    });

    it('appends a task to Inbox when its project is cleared', async () => {
        const movingTask = createTask({
            id: 'moving-task',
            project_id: 'project-a',
            project_position: 2000,
        });

        const inboxTask = createTask({
            id: 'inbox-task',
            project_id: null,
            project_position: 5000,
        });

        store.tasks.set([movingTask, inboxTask]);

        single.mockResolvedValue({
            data: {
                ...movingTask,
                project_id: null,
                project_position: 6000,
            },
            error: null,
        });

        await store.updateProject(movingTask, null);

        expect(update).toHaveBeenCalledExactlyOnceWith({
            project_id: null,
            project_position: 6000,
        });

        const result = store.tasks().find((task) => task.id === movingTask.id);

        expect(result?.project_id).toBeNull();
        expect(result?.project_position).toBe(6000);
    });

    it('restores project and position when a transfer fails', async () => {
        const movingTask = createTask({
            id: 'moving-task',
            project_id: 'project-a',
            project_position: 2000,
        });

        const destinationTask = createTask({
            id: 'destination-task',
            project_id: 'project-b',
            project_position: 3000,
        });

        store.tasks.set([movingTask, destinationTask]);

        single.mockResolvedValue({
            data: null,
            error: new Error('Project transfer failed'),
        });

        await expect(store.updateProject(movingTask, 'project-b')).rejects.toThrow(
            'Project transfer failed',
        );

        const result = store.tasks().find((task) => task.id === movingTask.id);

        expect(result?.project_id).toBe('project-a');
        expect(result?.project_position).toBe(2000);

        expect(store.mutating()).toBe(false);
        expect(store.error()).toBe('Project transfer failed');
    });
});

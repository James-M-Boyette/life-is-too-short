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
    let userId: ReturnType<typeof signal<string | null>>;
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
        userId = signal<string | null>(null);

        const channel = {
            on: vi.fn(),
            subscribe: vi.fn(),
        };

        channel.on.mockReturnValue(channel);
        channel.subscribe.mockReturnValue(channel);

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
                    useValue: { userId },
                },
                {
                    provide: SUPABASE_CLIENT,
                    useValue: {
                        from,
                        channel: vi.fn().mockReturnValue(channel),
                        removeChannel: vi.fn().mockResolvedValue(undefined),
                    },
                },
            ],
        });

        store = TestBed.inject(TasksStore);

        // Run the constructor effect before individual tests populate the task signal. Our mocked user is unauthenticated, so the effect will clear the initially empty task list ...
        TestBed.tick();
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

    it('appends a task when its planned date changes', async () => {
        const movingTask = createTask({
            id: 'moving',
            planned_date: '2026-10-29',
            planned_position: 1000,
        });

        const destinationTask = createTask({
            id: 'destination',
            planned_date: '2026-10-30',
            planned_position: 3000,
        });

        store.tasks.set([movingTask, destinationTask]);

        single.mockResolvedValue({
            data: {
                ...movingTask,
                planned_date: '2026-10-30',
                planned_position: 4000,
            },
            error: null,
        });

        await store.updatePlannedDate(movingTask, '2026-10-30');

        expect(update).toHaveBeenCalledExactlyOnceWith({
            planned_date: '2026-10-30',
            planned_position: 4000,
        });

        expect(store.tasks()[0].planned_position).toBe(4000);
    });

    it('falls back to the due-date context when planned date is cleared', async () => {
        const movingTask = createTask({
            id: 'moving',
            planned_date: '2026-10-29',
            due_date: '2026-10-31',
            planned_position: 1000,
        });

        const destinationTask = createTask({
            id: 'destination',
            due_date: '2026-10-31',
            planned_position: 2000,
        });

        store.tasks.set([movingTask, destinationTask]);

        single.mockResolvedValue({
            data: {
                ...movingTask,
                planned_date: null,
                planned_position: 3000,
            },
            error: null,
        });

        await store.updatePlannedDate(movingTask, null);

        expect(update).toHaveBeenCalledExactlyOnceWith({
            planned_date: null,
            planned_position: 3000,
        });
    });

    it('preserves planning order when changing a due date on a planned task', async () => {
        const task = createTask({
            planned_date: '2026-10-29',
            due_date: '2026-10-30',
            planned_position: 2500,
        });

        store.tasks.set([task]);

        single.mockResolvedValue({
            data: {
                ...task,
                due_date: '2026-11-05',
            },
            error: null,
        });

        await store.updateDueDate(task, '2026-11-05');

        expect(update).toHaveBeenCalledExactlyOnceWith({
            due_date: '2026-11-05',
            planned_position: 2500,
        });
    });

    it('appends a task when its due date changes its planning context', async () => {
        const movingTask = createTask({
            id: 'moving',
            planned_date: null,
            due_date: '2026-10-29',
            planned_position: 1000,
        });

        const destinationTask = createTask({
            id: 'destination',
            planned_date: null,
            due_date: '2026-10-30',
            planned_position: 3000,
        });

        store.tasks.set([movingTask, destinationTask]);

        single.mockResolvedValue({
            data: {
                ...movingTask,
                due_date: '2026-10-30',
                planned_position: 4000,
            },
            error: null,
        });

        await store.updateDueDate(movingTask, '2026-10-30');

        expect(update).toHaveBeenCalledExactlyOnceWith({
            due_date: '2026-10-30',
            planned_position: 4000,
        });
    });

    it('restores planned date and position after a failed scheduling update', async () => {
        const task = createTask({
            planned_date: '2026-10-29',
            planned_position: 1000,
        });

        store.tasks.set([task]);

        single.mockResolvedValue({
            data: null,
            error: new Error('Scheduling failed'),
        });

        await expect(store.updatePlannedDate(task, '2026-10-30')).rejects.toThrow(
            'Scheduling failed',
        );

        expect(store.tasks()[0].planned_date).toBe('2026-10-29');
        expect(store.tasks()[0].planned_position).toBe(1000);
        expect(store.mutating()).toBe(false);
    });

    it('preserves an optimistic position while its database update is pending', async () => {
        const task = createTask({
            planned_position: 1000,
        });

        store.tasks.set([task]);

        // Hold the Supabase request open so we control when it finishes.
        let resolveRequest!: (result: { data: Task; error: null }) => void;

        const pendingRequest = new Promise<{
            data: Task;
            error: null;
        }>((resolve) => {
            resolveRequest = resolve;
        });

        single.mockReturnValue(pendingRequest);

        // Begin saving the reordered task, but don't await it yet.
        const mutation = store.updateTaskPosition(task, 'planned_position', 2500);

        await vi.waitFor(() => {
            expect(store.tasks()[0].planned_position).toBe(2500);
            expect(single).toHaveBeenCalledOnce();
        });

        // Simulate a stale Realtime UPDATE arriving before Supabase
        // finishes the request.
        const staleTask = {
            ...task,
            planned_position: 1000,
        };

        store['upsertFromRealtime'](staleTask);

        // Capture the state before the request finishes.
        const positionAfterRealtime = store.tasks()[0].planned_position;

        // Finish the database request and cleanly settle the mutation.
        resolveRequest({
            data: {
                ...task,
                planned_position: 2500,
            },
            error: null,
        });

        await mutation;

        // The stale event should not have overwritten the optimistic value.
        expect(positionAfterRealtime).toBe(2500);

        // The final persisted value should also be correct.
        expect(store.tasks()[0].planned_position).toBe(2500);
    });

    it('keeps a task protected until all queued mutations finish', async () => {
        const task = createTask({
            planned_position: 1000,
            title: 'Original title',
        });

        store.tasks.set([task]);

        // Control when each Supabase request finishes.
        let resolvePosition!: (result: { data: Task; error: null }) => void;

        let resolveTitle!: (result: { data: Task; error: null }) => void;

        const positionRequest = new Promise<{
            data: Task;
            error: null;
        }>((resolve) => {
            resolvePosition = resolve;
        });

        const titleRequest = new Promise<{
            data: Task;
            error: null;
        }>((resolve) => {
            resolveTitle = resolve;
        });

        single.mockReturnValueOnce(positionRequest).mockReturnValueOnce(titleRequest);

        // Start two mutations affecting the same task.
        const positionMutation = store.updateTaskPosition(task, 'planned_position', 2500);

        const titleMutation = store.updateTitle(task, 'Updated title');

        expect(store.mutating()).toBe(true);

        // The queue starts its first operation in a microtask.
        await vi.waitFor(() => {
            // Only the first request should have started.
            expect(single).toHaveBeenCalledTimes(1);
        });

        // The title update must preserve the position saved
        // by the preceding mutation.
        expect(store.tasks()[0].planned_position).toBe(2500);

        // Finish the position update.
        resolvePosition({
            data: {
                ...task,
                planned_position: 2500,
            },
            error: null,
        });

        await positionMutation;

        // Allow the queued title mutation to begin.
        await vi.waitFor(() => {
            expect(single).toHaveBeenCalledTimes(2);
        });

        // The second operation is still pending.
        expect(store.mutating()).toBe(true);

        // Simulate a stale Realtime event.
        store['upsertFromRealtime']({
            ...task,
            title: 'Original title',
            planned_position: 1000,
        });

        // The pending mutation should protect the task.
        expect(store.tasks()[0].title).toBe('Updated title');

        // Finish the title update.
        resolveTitle({
            data: {
                ...task,
                title: 'Updated title',
                planned_position: 2500,
            },
            error: null,
        });

        await titleMutation;

        // Everything has finished.
        expect(store.mutating()).toBe(false);
        expect(store.tasks()[0].title).toBe('Updated title');
        expect(store.tasks()[0].planned_position).toBe(2500);
    });

    it('preserves task position when updating a stale description snapshot', async () => {
        const staleTask = createTask({
            description: 'Old description',
            planned_position: 1000,
        });

        store.tasks.set([
            {
                ...staleTask,
                planned_position: 2500,
            },
        ]);

        single.mockResolvedValue({
            data: {
                ...staleTask,
                description: 'New description',
                planned_position: 2500,
            },
            error: null,
        });

        await store.updateDescription(staleTask, 'New description');

        expect(store.tasks()[0].description).toBe('New description');
        expect(store.tasks()[0].planned_position).toBe(2500);
    });

    it('preserves task position when toggling a stale task snapshot', async () => {
        const staleTask = createTask({
            is_done: false,
            status: 'todo',
            planned_position: 1000,
        });

        store.tasks.set([
            {
                ...staleTask,
                planned_position: 2500,
            },
        ]);

        single.mockResolvedValue({
            data: {
                ...staleTask,
                is_done: true,
                status: 'done',
                planned_position: 2500,
            },
            error: null,
        });

        await store.toggleDone(staleTask);

        expect(update).toHaveBeenCalledWith({
            is_done: true,
            status: 'done',
        });

        expect(store.tasks()[0].is_done).toBe(true);
        expect(store.tasks()[0].status).toBe('done');
        expect(store.tasks()[0].planned_position).toBe(2500);
    });

    it('restores the latest saved position when a queued reorder fails', async () => {
        const task = createTask({
            planned_position: 1000,
        });

        store.tasks.set([task]);

        // First drag succeeds.
        single.mockResolvedValueOnce({
            data: {
                ...task,
                planned_position: 2500,
            },
            error: null,
        });

        // Second drag fails.
        single.mockResolvedValueOnce({
            data: null,
            error: new Error('Second reorder failed'),
        });

        const firstMutation = store.updateTaskPosition(task, 'planned_position', 2500);

        const secondMutation = store.updateTaskPosition(task, 'planned_position', 3500);

        await firstMutation;

        await expect(secondMutation).rejects.toThrow('Second reorder failed');

        // Restore the result of the first successful drag,
        // not the stale position from the original argument.
        expect(store.tasks()[0].planned_position).toBe(2500);

        expect(update).toHaveBeenCalledTimes(2);
        expect(store.mutating()).toBe(false);
    });

    it('restores the latest project when a queued transfer fails', async () => {
        const task = createTask({
            project_id: 'project-a',
            project_position: 1000,
        });

        const destinationTask = createTask({
            id: 'existing-task',
            project_id: 'project-b',
            project_position: 3000,
        });

        store.tasks.set([task, destinationTask]);

        single.mockResolvedValueOnce({
            data: {
                ...task,
                project_id: 'project-b',
                project_position: 4000,
            },
            error: null,
        });

        single.mockResolvedValueOnce({
            data: null,
            error: new Error('Second transfer failed'),
        });

        const firstMutation = store.updateProject(task, 'project-b');
        const secondMutation = store.updateProject(task, null);

        await firstMutation;

        await expect(secondMutation).rejects.toThrow('Second transfer failed');

        const result = store.tasks().find((current) => current.id === task.id);

        expect(result?.project_id).toBe('project-b');
        expect(result?.project_position).toBe(4000);

        expect(update).toHaveBeenCalledTimes(2);
        expect(store.mutating()).toBe(false);
    });

    it('restores the latest planned date when a queued scheduling update fails', async () => {
        const task = createTask({
            planned_date: '2026-10-29',
            planned_position: 1000,
        });

        store.tasks.set([task]);

        single
            .mockResolvedValueOnce({
                data: {
                    ...task,
                    planned_date: '2026-10-30',
                    planned_position: 1000,
                },
                error: null,
            })
            .mockResolvedValueOnce({
                data: null,
                error: new Error('Second scheduling update failed'),
            });

        const firstMutation = store.updatePlannedDate(task, '2026-10-30');
        const secondMutation = store.updatePlannedDate(task, '2026-10-31');

        await firstMutation;

        await expect(secondMutation).rejects.toThrow('Second scheduling update failed');

        const result = store.tasks()[0];

        expect(result.planned_date).toBe('2026-10-30');
        expect(result.planned_position).toBe(1000);
        expect(update).toHaveBeenCalledTimes(2);
    });

    it('restores the latest due date when a queued deadline update fails', async () => {
        const task = createTask({
            planned_date: null,
            due_date: '2026-10-29',
            planned_position: 1000,
        });

        store.tasks.set([task]);

        single
            .mockResolvedValueOnce({
                data: {
                    ...task,
                    due_date: '2026-10-30',
                    planned_position: 1000,
                },
                error: null,
            })
            .mockResolvedValueOnce({
                data: null,
                error: new Error('Second deadline update failed'),
            });

        const firstMutation = store.updateDueDate(task, '2026-10-30');
        const secondMutation = store.updateDueDate(task, '2026-10-31');

        await firstMutation;

        await expect(secondMutation).rejects.toThrow('Second deadline update failed');

        const result = store.tasks()[0];

        expect(result.due_date).toBe('2026-10-30');
        expect(result.planned_position).toBe(1000);
        expect(update).toHaveBeenCalledTimes(2);
    });

    it('does not apply a remote update while a local mutation is pending', async () => {
        const task = createTask({
            title: 'Original title',
            due_date: '2026-10-29',
        });

        store.tasks.set([task]);

        let resolveRequest!: (result: { data: Task; error: null }) => void;

        single
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveRequest = resolve;
                }),
            )
            .mockResolvedValueOnce({
                data: {
                    ...task,
                    title: 'Updated title',
                    due_date: '2026-10-30',
                },
                error: null,
            });

        const mutation = store.updateTitle(task, 'Updated title');

        await vi.waitFor(() => {
            expect(single).toHaveBeenCalledOnce();
        });

        // Simulate a remote change to a different field.
        store['upsertFromRealtime']({
            ...task,
            due_date: '2026-10-30',
        });

        // The local optimistic title remains protected.
        expect(store.tasks()[0].title).toBe('Updated title');

        resolveRequest({
            data: {
                ...task,
                title: 'Updated title',
            },
            error: null,
        });

        await mutation;

        // This currently fails: the remote due-date change was dropped.
        expect(single).toHaveBeenCalledTimes(2);
        expect(store.tasks()[0].title).toBe('Updated title');
        expect(store.tasks()[0].due_date).toBe('2026-10-30');
    });

    it('does not overwrite newer Realtime data with a stale reconciliation result', async () => {
        const task = createTask({
            title: 'Original title',
            due_date: '2026-10-29',
        });

        store.tasks.set([task]);

        let resolveMutation!: (result: { data: Task; error: null }) => void;

        let resolveReconciliation!: (result: { data: Task; error: null }) => void;

        const mutationRequest = new Promise<{
            data: Task;
            error: null;
        }>((resolve) => {
            resolveMutation = resolve;
        });

        const reconciliationRequest = new Promise<{
            data: Task;
            error: null;
        }>((resolve) => {
            resolveReconciliation = resolve;
        });

        single.mockReturnValueOnce(mutationRequest).mockReturnValueOnce(reconciliationRequest);

        const mutation = store.updateTitle(task, 'Updated title');

        await vi.waitFor(() => {
            expect(single).toHaveBeenCalledTimes(1);
        });

        // This event is skipped because the title mutation is pending.
        // It causes reconciliation to be scheduled.
        store['upsertFromRealtime']({
            ...task,
            due_date: '2026-10-30',
        });

        resolveMutation({
            data: {
                ...task,
                title: 'Updated title',
            },
            error: null,
        });

        // The title save finishes and reconciliation starts.
        await vi.waitFor(() => {
            expect(single).toHaveBeenCalledTimes(2);
        });

        // A newer Realtime event arrives while reconciliation is pending.
        store['upsertFromRealtime']({
            ...task,
            title: 'Updated title',
            due_date: '2026-10-31',
        });

        expect(store.tasks()[0].due_date).toBe('2026-10-31');

        // The reconciliation request finishes with an older snapshot.
        resolveReconciliation({
            data: {
                ...task,
                title: 'Updated title',
                due_date: '2026-10-30',
            },
            error: null,
        });

        await mutation;

        // The older query result must not overwrite newer Realtime state.
        expect(store.tasks()[0].due_date).toBe('2026-10-31');
    });

    it('does not overwrite a newer Realtime update with an older refresh result', async () => {
        const task = createTask({
            title: 'Original title',
        });

        store.tasks.set([task]);

        // Control when the refresh query finishes.
        let resolveRefresh!: (result: { data: Task[]; error: null }) => void;

        const refreshRequest = new Promise<{
            data: Task[];
            error: null;
        }>((resolve) => {
            resolveRefresh = resolve;
        });

        // refreshTasks() uses:
        // .select('*').order(...).order(...)
        const order = vi.fn();

        order.mockReturnValueOnce({
            order: vi.fn().mockReturnValue(refreshRequest),
        });

        select.mockReturnValueOnce({ order });

        // Begin fetching, but leave the database response pending.
        const refresh = store.refreshTasks();

        expect(from).toHaveBeenCalledWith('tasks');

        // Realtime delivers a newer version of the task.
        store['upsertFromRealtime']({
            ...task,
            title: 'Updated from another browser',
        });

        expect(store.tasks()[0].title).toBe('Updated from another browser');

        // The earlier refresh finally returns its stale snapshot.
        resolveRefresh({
            data: [task],
            error: null,
        });

        await refresh;

        // The stale refresh must not undo the newer Realtime update.
        expect(store.tasks()[0].title).toBe('Updated from another browser');
    });

    it('does not resurrect a task deleted by Realtime during refresh', async () => {
        const task = createTask();

        store.tasks.set([task]);

        let resolveRefresh!: (result: { data: Task[]; error: null }) => void;

        const refreshRequest = new Promise<{
            data: Task[];
            error: null;
        }>((resolve) => {
            resolveRefresh = resolve;
        });

        const order = vi.fn();

        order.mockReturnValueOnce({
            order: vi.fn().mockReturnValue(refreshRequest),
        });

        select.mockReturnValueOnce({ order });

        // Start a refresh that will return stale data.
        const refresh = store.refreshTasks();

        // Another browser deletes the task.
        store['removeFromRealtime'](task.id);

        expect(store.tasks()).toHaveLength(0);

        // The older refresh response still contains that task.
        resolveRefresh({
            data: [task],
            error: null,
        });

        await refresh;

        // The deleted task must remain absent.
        expect(store.tasks()).toHaveLength(0);
    });

    it('preserves an optimistic task while an older refresh completes', async () => {
        // Authenticate after the initial unauthenticated effect
        // has already run in beforeEach().
        userId.set('user-1');

        const existingTask = createTask({
            id: 'existing-task',
        });

        store.tasks.set([existingTask]);

        let resolveRefresh!: (result: { data: Task[]; error: null }) => void;

        let resolveInsert!: (result: { data: Task; error: null }) => void;

        const refreshRequest = new Promise<{
            data: Task[];
            error: null;
        }>((resolve) => {
            resolveRefresh = resolve;
        });

        const insertRequest = new Promise<{
            data: Task;
            error: null;
        }>((resolve) => {
            resolveInsert = resolve;
        });

        const order = vi.fn().mockReturnValueOnce({
            order: vi.fn().mockReturnValue(refreshRequest),
        });

        const insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockReturnValue(insertRequest),
            }),
        });

        select.mockReturnValueOnce({ order });

        from.mockImplementation(() => ({
            select,
            insert,
        }));

        const refresh = store.refreshTasks();

        const creation = store.addTask({
            title: 'New task',
            description: null,
            projectId: null,
        });

        // The temporary task should be visible immediately.
        const optimisticTask = store.tasks().find((task) => task.title === 'New task');

        expect(optimisticTask).toBeDefined();

        // Finish the earlier refresh, which knows nothing
        // about the new task.
        resolveRefresh({
            data: [existingTask],
            error: null,
        });

        await refresh;

        // The optimistic task must still be visible.
        expect(store.tasks().some((task) => task.id === optimisticTask?.id)).toBe(true);

        // Now complete the insert.
        resolveInsert({
            data: {
                ...optimisticTask!,
                id: 'saved-task',
            },
            error: null,
        });

        await creation;

        // Temporary ID should be replaced by the persisted ID.
        expect(store.tasks().some((task) => task.id === 'saved-task')).toBe(true);

        expect(store.tasks().some((task) => task.id === optimisticTask?.id)).toBe(false);
    });

    it('does not restore tasks when an old refresh finishes after logout', async () => {
        const task = createTask({
            user_id: 'user-1',
        });

        let resolveRefresh!: (result: { data: Task[]; error: null }) => void;

        const refreshRequest = new Promise<{
            data: Task[];
            error: null;
        }>((resolve) => {
            resolveRefresh = resolve;
        });

        // Mock the query:
        // from('tasks').select('*').order(...).order(...)
        const secondOrder = vi.fn().mockReturnValue(refreshRequest);

        const firstOrder = vi.fn().mockReturnValue({
            order: secondOrder,
        });

        select.mockReturnValue({
            order: firstOrder,
        });

        // Sign in as User A.
        // The constructor effect starts an initial refresh.
        userId.set('user-1');
        TestBed.tick();

        expect(from).toHaveBeenCalledWith('tasks');

        // Sign out before the query completes.
        userId.set(null);
        TestBed.tick();

        expect(store.tasks()).toEqual([]);

        // Supabase returns the old user's tasks after logout.
        resolveRefresh({
            data: [task],
            error: null,
        });

        await vi.waitFor(() => {
            expect(store.loading()).toBe(false);
        });

        // The old user's tasks must not reappear.
        expect(store.tasks()).toEqual([]);
    });

    it('does not report an old mutation error after logout', async () => {
        const task = createTask({
            user_id: 'user-1',
            title: 'Original title',
        });

        // Allow the authenticated constructor effect to refresh.
        const order = vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
                data: [task],
                error: null,
            }),
        });

        select.mockReturnValueOnce({ order });

        userId.set('user-1');
        TestBed.tick();

        await vi.waitFor(() => {
            expect(store.loading()).toBe(false);
        });

        store.tasks.set([task]);

        let resolveMutation!: (result: { data: null; error: Error }) => void;

        single.mockReturnValue(
            new Promise((resolve) => {
                resolveMutation = resolve;
            }),
        );

        // Start editing the title.
        const mutation = store.updateTitle(task, 'Updated title');

        await vi.waitFor(() => {
            expect(single).toHaveBeenCalledOnce();
        });

        // Log out before the database responds.
        userId.set(null);
        TestBed.tick();

        expect(store.tasks()).toEqual([]);
        expect(store.error()).toBeNull();

        // The old request now fails.
        resolveMutation({
            data: null,
            error: new Error('Old session request failed'),
        });

        await expect(mutation).rejects.toThrow('Old session request failed');

        // The previous session must not contaminate current state.
        expect(store.tasks()).toEqual([]);
        expect(store.error()).toBeNull();
    });

    it('does not apply an old mutation response after switching users', async () => {
        const userATask = createTask({
            id: 'shared-task-id',
            user_id: 'user-a',
            title: 'User A task',
        });

        const userBTask = createTask({
            id: 'shared-task-id',
            user_id: 'user-b',
            title: 'User B task',
        });

        // The constructor effect starts a refresh when the user changes.
        // Return an empty result so the test controls the task state.
        const secondOrder = vi.fn().mockResolvedValue({
            data: [],
            error: null,
        });

        const firstOrder = vi.fn().mockReturnValue({
            order: secondOrder,
        });

        // The refresh query needs order().
        // The mutation query needs single().
        select.mockReturnValue({
            order: firstOrder,
            single,
        });

        // Sign in as User A.
        userId.set('user-a');
        TestBed.tick();

        await vi.waitFor(() => {
            expect(store.loading()).toBe(false);
        });

        store.tasks.set([userATask]);

        // Hold User A's title update open.
        let resolveMutation!: (result: { data: Task; error: null }) => void;

        single.mockReturnValue(
            new Promise((resolve) => {
                resolveMutation = resolve;
            }),
        );

        const mutation = store.updateTitle(userATask, 'Updated User A task');

        await vi.waitFor(() => {
            expect(single).toHaveBeenCalledOnce();
        });

        // Switch to User B before User A's request completes.
        userId.set('user-b');
        TestBed.tick();

        await vi.waitFor(() => {
            expect(store.loading()).toBe(false);
        });

        store.tasks.set([userBTask]);

        // Complete User A's outstanding database request.
        resolveMutation({
            data: {
                ...userATask,
                title: 'Updated User A task',
            },
            error: null,
        });

        await mutation;

        // The response must not overwrite User B's task.
        expect(store.tasks()).toEqual([userBTask]);
        expect(store.error()).toBeNull();
    });

    it('restores only the deleted task when deletion fails', async () => {
        const taskA = createTask({
            id: 'task-a',
            title: 'Buy groceries',
        });

        const taskB = createTask({
            id: 'task-b',
            title: 'Book flights',
        });

        store.tasks.set([taskA, taskB]);

        // Hold the Supabase deletion request open.
        let resolveDelete!: (result: { error: Error }) => void;

        const deleteRequest = new Promise<{ error: Error }>((resolve) => {
            resolveDelete = resolve;
        });

        const deleteQuery = {
            eq: vi.fn(),
            then: (
                resolve: (value: { error: Error }) => unknown,
                reject?: (reason: unknown) => unknown,
            ) => deleteRequest.then(resolve, reject),
        };

        deleteQuery.eq.mockReturnValue(deleteQuery);

        const deleteMock = vi.fn().mockReturnValue(deleteQuery);

        from.mockReturnValue({
            delete: deleteMock,
        });

        // Start deleting Task A.
        const deletion = store.remove(taskA.id);

        // Wait until the optimistic deletion has happened.
        await vi.waitFor(() => {
            expect(store.tasks().map((task) => task.id)).toEqual(['task-b']);
        });

        // Another operation updates Task B while deletion is pending.
        const updatedTaskB = {
            ...taskB,
            title: 'Book flights to Athens',
        };

        store.tasks.update((tasks) =>
            tasks.map((task) => (task.id === taskB.id ? updatedTaskB : task)),
        );

        // Supabase rejects the deletion.
        resolveDelete({
            error: new Error('Delete failed'),
        });

        await expect(deletion).rejects.toThrow('Delete failed');

        // Task A should return, but Task B's newer title must survive.
        expect(store.tasks()).toEqual([taskA, updatedTaskB]);
    });

    it('does not restore a deleted task when deletion fails after logout', async () => {
        const task = createTask({
            id: 'task-a',
            user_id: 'user-1',
            title: 'Buy groceries',
        });

        // Mock the initial refresh triggered by authentication.
        const secondOrder = vi.fn().mockResolvedValue({
            data: [task],
            error: null,
        });

        const firstOrder = vi.fn().mockReturnValue({
            order: secondOrder,
        });

        select.mockReturnValue({
            order: firstOrder,
        });

        // Sign in as User A.
        userId.set('user-1');
        TestBed.tick();

        await vi.waitFor(() => {
            expect(store.loading()).toBe(false);
        });

        store.tasks.set([task]);

        // Keep the database deletion pending.
        let resolveDelete!: (result: { error: Error }) => void;

        const deleteRequest = new Promise<{ error: Error }>((resolve) => {
            resolveDelete = resolve;
        });

        // Supabase's query builder supports chained .eq() calls
        // and executes when awaited.
        const deleteQuery = {
            eq: vi.fn(),
            then: (
                resolve: (value: { error: Error }) => unknown,
                reject?: (reason: unknown) => unknown,
            ) => deleteRequest.then(resolve, reject),
        };

        deleteQuery.eq.mockReturnValue(deleteQuery);

        const deleteMock = vi.fn().mockReturnValue(deleteQuery);

        from.mockReturnValue({
            delete: deleteMock,
        });

        // Begin the deletion while authenticated.
        const deletion = store.remove(task.id);

        await vi.waitFor(() => {
            expect(deleteMock).toHaveBeenCalledOnce();
        });

        // The optimistic deletion should already be visible.
        expect(store.tasks()).toEqual([]);

        // Log out before Supabase responds.
        userId.set(null);
        TestBed.tick();

        expect(store.tasks()).toEqual([]);
        expect(store.error()).toBeNull();

        // The request belonging to User A fails after logout.
        resolveDelete({
            error: new Error('Delete failed'),
        });

        await expect(deletion).rejects.toThrow('Delete failed');

        // User A's task must not reappear.
        expect(store.tasks()).toEqual([]);

        // An old request must not set an error in the new session.
        expect(store.error()).toBeNull();
    });

    it('does not report a task creation error after logout', async () => {
        // Mock the initial refresh triggered when User A signs in.
        const secondOrder = vi.fn().mockResolvedValue({
            data: [],
            error: null,
        });

        const firstOrder = vi.fn().mockReturnValue({
            order: secondOrder,
        });

        select.mockReturnValue({
            order: firstOrder,
        });

        userId.set('user-1');
        TestBed.tick();

        await vi.waitFor(() => {
            expect(store.loading()).toBe(false);
        });

        // Keep the insert request pending.
        let resolveInsert!: (result: { data: null; error: Error }) => void;

        const insertRequest = new Promise<{
            data: null;
            error: Error;
        }>((resolve) => {
            resolveInsert = resolve;
        });

        const insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockReturnValue(insertRequest),
            }),
        });

        from.mockReturnValue({ insert });

        // Begin creating a task as User A.
        const creation = store.addTask({
            title: 'Buy groceries',
            description: null,
            projectId: null,
        });

        // Optimistic creation should appear immediately.
        expect(store.tasks().some((task) => task.title === 'Buy groceries')).toBe(true);

        expect(store.creating()).toBe(true);

        // Log out while the insert is still pending.
        userId.set(null);
        TestBed.tick();

        expect(store.tasks()).toEqual([]);
        expect(store.error()).toBeNull();
        expect(store.creating()).toBe(false);

        // The old insert now fails.
        resolveInsert({
            data: null,
            error: new Error('Insert failed'),
        });

        await expect(creation).rejects.toThrow('Insert failed');

        // The old session must not modify the logged-out store.
        expect(store.tasks()).toEqual([]);
        expect(store.error()).toBeNull();
        expect(store.creating()).toBe(false);
    });

    it('ignores Realtime events from a previous session after logout', async () => {
        const task = createTask({
            id: 'user-a-task',
            user_id: 'user-a',
            title: 'User A private task',
        });

        // Mock the initial task refresh when User A signs in.
        const secondOrder = vi.fn().mockResolvedValue({
            data: [],
            error: null,
        });

        const firstOrder = vi.fn().mockReturnValue({
            order: secondOrder,
        });

        select.mockReturnValue({
            order: firstOrder,
        });

        // Capture the callback registered with Supabase Realtime.
        let realtimeCallback!: (payload: unknown) => void;

        const channel = {
            on: vi.fn(),
            subscribe: vi.fn(),
        };

        channel.on.mockImplementation(
            (_event: string, _filter: unknown, callback: (payload: unknown) => void) => {
                realtimeCallback = callback;
                return channel;
            },
        );

        channel.subscribe.mockReturnValue(channel);

        // Override the channel factory before signing in.
        const supabase = store['supabase'];

        vi.spyOn(supabase, 'channel').mockReturnValue(
            channel as unknown as ReturnType<typeof supabase.channel>,
        );

        // Sign in as User A.
        userId.set('user-a');
        TestBed.tick();

        await vi.waitFor(() => {
            expect(store.loading()).toBe(false);
        });

        expect(channel.on).toHaveBeenCalledOnce();
        expect(realtimeCallback).toBeDefined();

        // Sign out, which tears down the subscription.
        userId.set(null);
        TestBed.tick();

        expect(store.tasks()).toEqual([]);

        // Simulate an event already queued on the old channel.
        realtimeCallback({
            eventType: 'INSERT',
            new: task,
        });

        // The expired subscription must not reinsert User A's task.
        expect(store.tasks()).toEqual([]);
    });
});

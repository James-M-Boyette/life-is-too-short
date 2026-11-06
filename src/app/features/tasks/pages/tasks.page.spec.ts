import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskCreateDialogService } from '@/features/tasks/services/task-create-dialog.service';
import { TasksPage } from './tasks.page';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import { ProjectsStore } from '@/features/projects/state/projects.store';
import { AuthStore } from '@/shared/supabase/auth.store';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import type { Task } from '@/features/tasks/models/tasks.model';
import { TaskSchedulerComponent } from '@/features/tasks/components/task-scheduler/task-scheduler.component';

const task = (id: string, plannedDate: string | null, overrides: Partial<Task> = {}): Task => ({
    id, user_id: 'user-1', title: id, description: null, project_id: null,
    planned_date: plannedDate, due_date: null, due_at: null, is_done: false,
    status: 'todo', planned_position: 1000, project_position: 1000,
    created_at: '', updated_at: '', ...overrides,
});

describe('TasksPage', () => {
    let component: TasksPage;
    let fixture: ComponentFixture<TasksPage>;
    const tasks = signal<Task[]>([]);
    const updatePlannedDate = vi.fn();
    const updateDueDate = vi.fn();
    const userId = signal<string | null>('user-1');

    beforeEach(async () => {
        userId.set('user-1');
        tasks.set([
            task('old', '2026-11-01'),
            task('due-only', null, { due_date: '2026-11-02' }),
            task('today', '2026-11-05'),
            task('future', '2026-11-06'),
            task('done', '2026-11-01', { is_done: true }),
            task('unscheduled', null),
            task('also-unscheduled', null),
            task('done-unscheduled', null, { is_done: true }),
        ]);
        updatePlannedDate.mockReset().mockImplementation(async (t: Task, date: string | null) => {
            tasks.update(items => items.map(item => item.id === t.id ? { ...item, planned_date: date } : item));
        });
        updateDueDate.mockReset().mockImplementation(async (t: Task, date: string | null) => {
            tasks.update(items => items.map(item => item.id === t.id ? { ...item, due_date: date } : item));
        });
        await TestBed.configureTestingModule({
            imports: [TasksPage],
            providers: [
                TaskCreateDialogService,
                { provide: Router, useValue: {} },
                { provide: AuthStore, useValue: { userId } },
                { provide: ProjectsStore, useValue: { projects: signal([]), projectTree: signal([]) } },
                { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
                { provide: TasksStore, useValue: {
                    tasks, updatePlannedDate, updateDueDate, mutating: signal(false), error: signal(null),
                    realtimeConnected: signal(false),
                } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(TasksPage);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('view', 'today');
        await fixture.whenStable();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    async function openScheduler(id = 'unscheduled') {
        component['setTodayLayout']('planning');
        fixture.detectChanges();
        fixture.nativeElement.querySelector(`[data-schedule-task-id="${id}"]`).click();
        fixture.detectChanges();
        await fixture.whenStable();
    }

    function scheduler() {
        return fixture.debugElement.query(By.directive(TaskSchedulerComponent));
    }

    function scheduleButton(label: string): HTMLElement {
        return Array.from(scheduler().nativeElement.querySelectorAll('button, [role="button"]') as NodeListOf<HTMLElement>)
            .find(button => button.textContent?.trim() === label || button.getAttribute('aria-label')?.startsWith(label + ' —'))!;
    }

    async function settleSchedule() {
        await fixture.whenStable();
        fixture.detectChanges();
    }

    it('keeps the same editor open when a task moves columns and saves only the selected field', async () => {
        await openScheduler();
        const editor = scheduler().componentInstance;
        expect(updatePlannedDate).not.toHaveBeenCalled();
        scheduleButton('Today').click();
        await settleSchedule();
        expect(updatePlannedDate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'unscheduled' }), '2026-11-05');
        expect(scheduler().componentInstance).toBe(editor);
        expect(fixture.nativeElement.querySelector('[aria-labelledby="today-heading"] [data-schedule-task-id="unscheduled"]')).toBeTruthy();
        scheduleButton('Due').click();
        await settleSchedule();
        expect(updateDueDate).not.toHaveBeenCalled();
        scheduleButton('Tomorrow').click();
        await settleSchedule();
        expect(updateDueDate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'unscheduled' }), '2026-11-06');
        expect(tasks().find(task => task.id === 'unscheduled')?.planned_date).toBe('2026-11-05');
        expect(scheduler().componentInstance).toBe(editor);
    });

    it('does not save unchanged selections and prevents duplicate submissions before rendering pending state', async () => {
        await openScheduler();
        scheduleButton('No date').click();
        expect(updatePlannedDate).not.toHaveBeenCalled();
        let finish!: () => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        const today = scheduleButton('Today');
        today.click();
        today.click();
        fixture.detectChanges();
        expect(updatePlannedDate).toHaveBeenCalledTimes(1);
        expect(scheduler().nativeElement.textContent).toContain('Saving date');
        expect(scheduler().nativeElement.querySelector('.current-date').textContent).toContain('None');
        finish();
        await settleSchedule();
    });

    it('shows save errors and retries the failed field even after switching tabs', async () => {
        await openScheduler();
        updatePlannedDate.mockRejectedValueOnce(new Error('offline'));
        scheduleButton('Today').click();
        await settleSchedule();
        expect(scheduler().nativeElement.querySelector('[role="alert"]').textContent).toContain('planned date');
        expect(scheduler().nativeElement.querySelector('.current-date').textContent).toContain('None');
        scheduleButton('Due').click();
        await settleSchedule();
        scheduleButton('Retry').click();
        await settleSchedule();
        expect(updatePlannedDate).toHaveBeenCalledTimes(2);
        expect(updateDueDate).not.toHaveBeenCalled();
        expect(scheduler().nativeElement.querySelector('[role="alert"]')).toBeNull();
    });

    it('Escape dismisses without saving and restores focus to the moved task', async () => {
        await openScheduler();
        scheduleButton('Today').click();
        await settleSchedule();
        scheduler().nativeElement.querySelector('section').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
        await settleSchedule();
        expect(scheduler()).toBeNull();
        expect(updatePlannedDate).toHaveBeenCalledTimes(1);
        expect(document.activeElement?.getAttribute('data-schedule-task-id')).toBe('unscheduled');
        await openScheduler();
        expect(scheduler().nativeElement.querySelector('.current-date').textContent).toContain('Nov 5, 2026');
        expect(updatePlannedDate).toHaveBeenCalledTimes(1);
    });

    it('switches tasks without saving and discards a previous task\'s late error', async () => {
        await openScheduler();
        let fail!: (reason: Error) => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
        scheduleButton('Today').click();
        fixture.detectChanges();
        await openScheduler('old');
        expect(scheduler().componentInstance.task().id).toBe('old');
        fail(new Error('late failure'));
        await settleSchedule();
        expect(scheduler().nativeElement.querySelector('[role="alert"]')).toBeNull();
        expect(scheduler().nativeElement.querySelector('.current-date').textContent).toContain('Nov 1, 2026');
    });

    it('closes on account changes and ignores the previous account\'s pending failure', async () => {
        await openScheduler();
        let fail!: (reason: Error) => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
        scheduleButton('Today').click();
        userId.set('user-2');
        fixture.detectChanges();
        fail(new Error('old session failure'));
        await settleSchedule();
        expect(scheduler()).toBeNull();
        expect(component['scheduleError']()).toBeNull();
        expect(component['scheduleSaving']()).toBe(false);
    });

    it('reconciles with live task changes and dismisses if the task disappears', async () => {
        await openScheduler();
        tasks.update(items => items.map(task => task.id === 'unscheduled' ? { ...task, planned_date: '2026-11-10' } : task));
        await settleSchedule();
        expect(scheduler().nativeElement.querySelector('.current-date').textContent).toContain('Nov 10, 2026');
        expect(updatePlannedDate).not.toHaveBeenCalled();
        tasks.update(items => items.filter(task => task.id !== 'unscheduled'));
        await settleSchedule();
        expect(scheduler()).toBeNull();
    });

    it('does not label an optimistic date as persisted when reopening during a save', async () => {
        await openScheduler();
        let finish!: () => void;
        updatePlannedDate.mockImplementationOnce((task: Task, date: string) => {
            tasks.update(items => items.map(item => item.id === task.id ? { ...item, planned_date: date } : item));
            return new Promise<void>(resolve => { finish = resolve; });
        });
        scheduleButton('Today').click();
        fixture.detectChanges();
        scheduler().nativeElement.querySelector('[aria-label="Close scheduling"]').click();
        await settleSchedule();
        await openScheduler();
        expect(scheduler().nativeElement.querySelector('.current-date').textContent).toContain('None');
        expect(scheduler().nativeElement.textContent).toContain('Saving date');
        finish();
        await settleSchedule();
        expect(scheduler().nativeElement.querySelector('.current-date').textContent).toContain('Nov 5, 2026');
    });

    it('shows bulk actions only in the planning columns', () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Reschedule for today');
        expect(fixture.nativeElement.textContent).not.toContain("Clear Today's Schedule");
        component['setTodayLayout']('planning');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Reschedule for today');
        expect(fixture.nativeElement.querySelector('[aria-labelledby="today-heading"] .today-board__column-header').textContent)
            .toContain("Clear Today's Schedule");
        expect(fixture.nativeElement.querySelector('[aria-labelledby="unscheduled-heading"]').textContent)
            .toContain('Reschedule for today');
    });

    it('reschedules only open overdue tasks and preserves due dates', async () => {
        component['setTodayLayout']('planning');
        await component['rescheduleOverdueToToday']();
        expect(updatePlannedDate.mock.calls.map(([t, date]) => [t.id, date])).toEqual([
            ['old', '2026-11-05'], ['due-only', '2026-11-05'],
        ]);
        expect(tasks().find(t => t.id === 'due-only')?.due_date).toBe('2026-11-02');
        expect(component['overdueTasks']()).toEqual([]);
    });

    it('stops after a failed save and reports partial progress', async () => {
        updatePlannedDate.mockImplementationOnce(async () => {}).mockRejectedValueOnce(new Error('offline'));
        component['setTodayLayout']('planning');
        await component['rescheduleOverdueToToday']();
        expect(component['overdueRescheduleError']()).toContain('Rescheduled 1 of 2 tasks');
        expect(component['reschedulingOverdue']()).toBe(false);
    });

    it('does not reschedule from focus mode or submit twice while saving', async () => {
        await component['rescheduleOverdueToToday']();
        expect(updatePlannedDate).not.toHaveBeenCalled();
        component['setTodayLayout']('planning');
        let finish!: () => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        const saving = component['rescheduleOverdueToToday']();
        await component['rescheduleOverdueToToday']();
        expect(updatePlannedDate).toHaveBeenCalledTimes(1);
        finish();
        await saving;
        expect(updatePlannedDate).toHaveBeenCalledTimes(2);
    });

    it('reschedules only open unscheduled tasks to today', async () => {
        component['setTodayLayout']('planning');
        await component['rescheduleUnscheduledToToday']();
        expect(updatePlannedDate.mock.calls.map(([t, date]) => [t.id, date])).toEqual([
            ['also-unscheduled', '2026-11-05'], ['unscheduled', '2026-11-05'],
        ]);
        expect(component['unscheduledTasks']()).toEqual([]);
        expect(tasks().find(t => t.id === 'done-unscheduled')?.planned_date).toBeNull();
        expect(component['overdueTasks']()).toHaveLength(2);
    });

    it('reports partial progress in the Unscheduled column when saving fails', async () => {
        updatePlannedDate.mockImplementationOnce(async () => {}).mockRejectedValueOnce(new Error('offline'));
        component['setTodayLayout']('planning');
        await component['rescheduleUnscheduledToToday']();
        expect(component['unscheduledRescheduleError']()).toContain('Rescheduled 1 of 2 tasks');
        expect(component['overdueRescheduleError']()).toBeNull();
        expect(component['reschedulingUnscheduled']()).toBe(false);
    });

    it('blocks Unscheduled in focus mode and prevents overlapping bulk actions', async () => {
        await component['rescheduleUnscheduledToToday']();
        expect(updatePlannedDate).not.toHaveBeenCalled();
        component['setTodayLayout']('planning');
        let finish!: () => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        const saving = component['rescheduleUnscheduledToToday']();
        await component['rescheduleUnscheduledToToday']();
        await component['rescheduleOverdueToToday']();
        expect(updatePlannedDate).toHaveBeenCalledTimes(1);
        finish();
        await saving;
        expect(updatePlannedDate).toHaveBeenCalledTimes(2);
    });

    it('clears planned dates only for open Today tasks while preserving due dates', async () => {
        tasks.set([
            task('planned-only', '2026-11-05'),
            task('due-today', '2026-11-05', { due_date: '2026-11-05' }),
            task('due-later', '2026-11-05', { due_date: '2026-11-12' }),
            task('due-only', null, { due_date: '2026-11-05' }),
            task('done-today', '2026-11-05', { is_done: true }),
            task('future', '2026-11-12'),
        ]);
        component['setTodayLayout']('planning');
        await component['clearTodaySchedule']();
        expect(updatePlannedDate.mock.calls.map(([t, date]) => [t.id, date])).toEqual([
            ['due-later', null], ['due-today', null], ['planned-only', null],
        ]);
        expect(tasks().find(t => t.id === 'due-today')?.due_date).toBe('2026-11-05');
        expect(tasks().find(t => t.id === 'due-later')?.due_date).toBe('2026-11-12');
        expect(component['todayTasks']().map(t => t.id)).toEqual(['due-only', 'due-today']);
        expect(tasks().find(t => t.id === 'done-today')?.planned_date).toBe('2026-11-05');
        expect(tasks().find(t => t.id === 'future')?.planned_date).toBe('2026-11-12');
        expect(component['clearableTodayTasks']()).toEqual([]);
    });

    it('reports failed clearing and restores the bulk action state', async () => {
        updatePlannedDate.mockRejectedValueOnce(new Error('offline'));
        component['setTodayLayout']('planning');
        await component['clearTodaySchedule']();
        expect(component['clearTodayError']()).toContain('Cleared planned dates for 0 of 1 tasks');
        expect(component['bulkScheduleBusy']()).toBe(false);
        expect(tasks().find(t => t.id === 'today')?.planned_date).toBe('2026-11-05');
    });

    it('blocks clearing in focus mode and other bulk actions while clearing', async () => {
        await component['clearTodaySchedule']();
        expect(updatePlannedDate).not.toHaveBeenCalled();
        component['setTodayLayout']('planning');
        let finish!: () => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        const saving = component['clearTodaySchedule']();
        await component['clearTodaySchedule']();
        await component['rescheduleUnscheduledToToday']();
        await component['rescheduleOverdueToToday']();
        expect(updatePlannedDate).toHaveBeenCalledTimes(1);
        finish();
        await saving;
        expect(component['bulkScheduleBusy']()).toBe(false);
    });
});

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
import { Popover } from 'primeng/popover';
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
                    tasks, updatePlannedDate, updateDueDate, mutating: signal(false), error: signal(null), loading: signal(false),
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

    function popover(): Popover {
        return fixture.debugElement.query(By.directive(Popover)).componentInstance;
    }

    it('closes Planned immediately before a save settles and blocks duplicate actions', async () => {
        await openScheduler();
        let finish!: () => void;
        updatePlannedDate.mockImplementationOnce((t: Task, date: string) => {
            tasks.update(items => items.map(item => item.id === t.id ? { ...item, planned_date: date } : item));
            return new Promise<void>(resolve => { finish = resolve; });
        });
        const today = scheduleButton('Today');
        today.click();
        today.click();
        expect(popover().overlayVisible).toBe(false);
        expect(updatePlannedDate).toHaveBeenCalledTimes(1);
        expect(updateDueDate).not.toHaveBeenCalled();
        expect(tasks().find(t => t.id === 'unscheduled')?.planned_date).toBe('2026-11-05');
        await settleSchedule();
        expect(scheduler()).toBeNull();
        finish();
        await settleSchedule();
    });

    it.each(['Today', 'No date'])('closes an unchanged Planned %s selection without writing', async label => {
        await openScheduler(label === 'Today' ? 'today' : 'unscheduled');
        scheduleButton(label).click();
        expect(popover().overlayVisible).toBe(false);
        await settleSchedule();
        expect(updatePlannedDate).not.toHaveBeenCalled();
        expect(updateDueDate).not.toHaveBeenCalled();
        expect(scheduler()).toBeNull();
    });

    it('keeps Due open in the same column, including clearing, then allows a Planned selection', async () => {
        await openScheduler('today');
        const editor = scheduler().componentInstance;
        scheduleButton('Due').click();
        await settleSchedule();
        scheduleButton('Tomorrow').click();
        await settleSchedule();
        expect(popover().overlayVisible).toBe(true);
        expect(scheduler().componentInstance).toBe(editor);
        expect(updateDueDate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'today' }), '2026-11-06');
        expect(tasks().find(t => t.id === 'today')?.planned_date).toBe('2026-11-05');
        scheduleButton('No date').click();
        await settleSchedule();
        expect(popover().overlayVisible).toBe(true);
        expect(tasks().find(t => t.id === 'today')?.due_date).toBeNull();
        scheduleButton('Planned').click();
        await settleSchedule();
        scheduleButton('Tomorrow').click();
        expect(popover().overlayVisible).toBe(false);
        await settleSchedule();
        expect(updatePlannedDate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'today' }), '2026-11-06');
    });

    it('keeps an unchanged Due selection open without a write', async () => {
        await openScheduler('today');
        scheduleButton('Due').click();
        await settleSchedule();
        scheduleButton('No date').click();
        expect(popover().overlayVisible).toBe(true);
        expect(updateDueDate).not.toHaveBeenCalled();
    });

    it('keeps Due open when a calendar selection stays within Overdue', async () => {
        await openScheduler('due-only');
        scheduleButton('Due').click();
        await settleSchedule();
        const day = Array.from(scheduler().nativeElement.querySelectorAll('td span[data-date]') as NodeListOf<HTMLElement>)
            .find(cell => cell.textContent?.trim() === '1')!;
        day.click();
        await settleSchedule();
        expect(popover().overlayVisible).toBe(true);
        expect(updateDueDate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'due-only' }), '2026-11-01');
        expect(fixture.nativeElement.querySelector('[aria-labelledby="overdue-heading"] [data-schedule-task-id="due-only"]')).toBeTruthy();
    });

    it('clears Planned without clearing the overdue obligation or moving it automatically into Today', async () => {
        tasks.set([task('item', '2026-11-05', { due_date: '2026-11-04' })]);
        await openScheduler('item');
        scheduleButton('No date').click();
        await settleSchedule();
        expect(scheduler()).toBeNull();
        expect(tasks()[0]).toMatchObject({ planned_date: null, due_date: '2026-11-04' });
        const overdue = fixture.nativeElement.querySelector('[aria-labelledby="overdue-heading"]');
        expect(overdue.textContent).toContain('Due: Nov 4');
        expect(overdue.querySelector('[data-schedule-task-id="item"]')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('[aria-labelledby="today-heading"] [data-schedule-task-id="item"]')).toBeNull();
    });

    it.each(['Today', 'No date', 'Next week'])('closes Due %s when an unplanned overdue task changes visible column', async label => {
        await openScheduler('due-only');
        scheduleButton('Due').click();
        await settleSchedule();
        let finish!: () => void;
        updateDueDate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        scheduleButton(label).click();
        expect(popover().overlayVisible).toBe(false);
        expect(updateDueDate).toHaveBeenCalledTimes(1);
        finish();
        await settleSchedule();
        expect(scheduler()).toBeNull();
    });

    it('closes Due when an unplanned obligation leaves Today focus and restores fallback focus', async () => {
        tasks.set([task('obligation', null, { due_date: '2026-11-05' })]);
        await openScheduler('obligation');
        component['setTodayLayout']('focus');
        await settleSchedule();
        fixture.nativeElement.querySelector('[data-schedule-task-id="obligation"]').click();
        await settleSchedule();
        scheduleButton('Due').click();
        await settleSchedule();
        scheduleButton('Tomorrow').click();
        expect(popover().overlayVisible).toBe(false);
        await settleSchedule();
        expect(fixture.nativeElement.querySelector('[data-schedule-task-id="obligation"]')).toBeNull();
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.tasks-page'));
    });

    it('uses individual Upcoming dates as visible columns', async () => {
        tasks.set([task('obligation', null, { due_date: '2026-11-05' })]);
        fixture.componentRef.setInput('view', 'upcoming');
        await openScheduler('obligation');
        scheduleButton('Due').click();
        await settleSchedule();
        scheduleButton('Tomorrow').click();
        expect(popover().overlayVisible).toBe(false);
        await settleSchedule();
        expect(fixture.nativeElement.querySelector('[aria-labelledby="upcoming-2026-11-06"] [data-schedule-task-id="obligation"]')).toBeTruthy();
    });

    it.each(['all', 'inbox', 'project'])('keeps Due open in the same %s list despite a different display date', async view => {
        tasks.set([task('item', null, { project_id: view === 'project' ? 'project-1' : null })]);
        fixture.componentRef.setInput('view', view);
        fixture.componentRef.setInput('projectId', view === 'project' ? 'project-1' : undefined);
        await openScheduler('item');
        scheduleButton('Due').click();
        await settleSchedule();
        scheduleButton('Tomorrow').click();
        await settleSchedule();
        expect(popover().overlayVisible).toBe(true);
        expect(tasks().find(t => t.id === 'item')?.planned_date).toBeNull();
    });

    it('shows a failed Planned save after closing and retries without reopening the popover', async () => {
        await openScheduler();
        updatePlannedDate.mockRejectedValueOnce(new Error('offline'));
        scheduleButton('Today').click();
        expect(popover().overlayVisible).toBe(false);
        await settleSchedule();
        expect(scheduler()).toBeNull();
        const message = fixture.nativeElement.querySelector('.schedule-save-error');
        expect(message.textContent).toContain('planned date for');
        expect(message.textContent).toContain('unscheduled');
        expect(tasks().find(t => t.id === 'unscheduled')?.planned_date).toBeNull();
        message.querySelector('button').click();
        await settleSchedule();
        expect(updatePlannedDate).toHaveBeenCalledTimes(2);
        expect(updateDueDate).not.toHaveBeenCalled();
        expect(tasks().find(t => t.id === 'unscheduled')?.planned_date).toBe('2026-11-05');
        expect(fixture.nativeElement.querySelector('.schedule-save-error')).toBeNull();
        expect(scheduler()).toBeNull();
    });

    it('preserves failed Due feedback after closing manually and retries only that field', async () => {
        await openScheduler('today');
        scheduleButton('Due').click();
        await settleSchedule();
        const align = vi.spyOn(popover(), 'align');
        updateDueDate.mockRejectedValueOnce(new Error('offline'));
        scheduleButton('Tomorrow').click();
        await settleSchedule();
        expect(popover().overlayVisible).toBe(true);
        expect(align).toHaveBeenCalled();
        scheduler().nativeElement.querySelector('section').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settleSchedule();
        expect(fixture.nativeElement.querySelector('.schedule-save-error').textContent).toContain('due date');
        fixture.nativeElement.querySelector('.schedule-save-error button').click();
        await settleSchedule();
        expect(updateDueDate).toHaveBeenCalledTimes(2);
        expect(updatePlannedDate).not.toHaveBeenCalled();
    });

    it('Escape and outside clicks dismiss without writes and restore sensible focus', async () => {
        await openScheduler();
        scheduler().nativeElement.querySelector('section').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await settleSchedule();
        expect(scheduler()).toBeNull();
        expect(document.activeElement?.getAttribute('data-schedule-task-id')).toBe('unscheduled');
        await openScheduler();
        document.body.click();
        await settleSchedule();
        expect(popover().overlayVisible).toBe(false);
        expect(updatePlannedDate).not.toHaveBeenCalled();
        expect(updateDueDate).not.toHaveBeenCalled();
    });

    it('discards a previous task\'s late failure after another editor is opened', async () => {
        await openScheduler();
        let fail!: (reason: Error) => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
        scheduleButton('Today').click();
        await settleSchedule();
        await openScheduler('old');
        fail(new Error('late failure'));
        await settleSchedule();
        expect(scheduler().componentInstance.task().id).toBe('old');
        expect(fixture.nativeElement.querySelector('.schedule-save-error')).toBeNull();
    });

    it('ignores a previous account\'s pending failure after dismissal', async () => {
        await openScheduler();
        let fail!: (reason: Error) => void;
        updatePlannedDate.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
        scheduleButton('Today').click();
        userId.set('user-2');
        fixture.detectChanges();
        fail(new Error('old session failure'));
        await settleSchedule();
        expect(scheduler()).toBeNull();
        expect(fixture.nativeElement.querySelector('.schedule-save-error')).toBeNull();
        expect(component['scheduleSaving']()).toBe(false);
    });

    it('dismisses when live task state invalidates its original visible location', async () => {
        await openScheduler();
        tasks.update(items => items.map(t => t.id === 'unscheduled' ? { ...t, planned_date: '2026-11-10' } : t));
        await settleSchedule();
        expect(scheduler()).toBeNull();
        expect(updatePlannedDate).not.toHaveBeenCalled();
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

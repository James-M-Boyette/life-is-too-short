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
import { TaskListComponent } from '@/features/tasks/components/task-list/task-list.component';
import type { Task } from '@/features/tasks/models/tasks.model';

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

    beforeEach(async () => {
        tasks.set([
            task('old', '2026-11-01'),
            task('due-only', null, { due_date: '2026-11-02' }),
            task('today', '2026-11-05'),
            task('future', '2026-11-06'),
            task('done', '2026-11-01', { is_done: true }),
        ]);
        updatePlannedDate.mockReset().mockImplementation(async (t: Task, date: string) => {
            tasks.update(items => items.map(item => item.id === t.id ? { ...item, planned_date: date } : item));
        });
        await TestBed.configureTestingModule({
            imports: [TasksPage],
            providers: [
                TaskCreateDialogService,
                { provide: Router, useValue: {} },
                { provide: AuthStore, useValue: { userId: signal('user-1') } },
                { provide: ProjectsStore, useValue: { projects: signal([]), projectTree: signal([]) } },
                { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
                { provide: TasksStore, useValue: {
                    tasks, updatePlannedDate, mutating: signal(false), error: signal(null),
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

    it('shows the bulk action and picker default only in the planning overdue column', () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Reschedule all to today');
        component['setTodayLayout']('planning');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Reschedule all to today');
        const lists = fixture.debugElement.queryAll(By.directive(TaskListComponent));
        expect(lists.map(list => list.componentInstance.defaultPlannedDateToToday())).toEqual([false, false, true]);
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
});

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
import type { Project } from '@/features/projects/models/project.model';
import type { Task } from '@/features/tasks/models/tasks.model';
import { ConfirmationService } from 'primeng/api';
import { Popover } from 'primeng/popover';
import { TaskSchedulerComponent } from '@/features/tasks/components/task-scheduler/task-scheduler.component';
import { TaskListComponent } from '@/features/tasks/components/task-list/task-list.component';
import { TaskRowComponent } from '@/features/tasks/components/task-row/task-row.component';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import type { TaskOrderField } from '@/features/tasks/utils/task-ordering.util';

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
    const projects = signal<Project[]>([]);
    const updatePlannedDate = vi.fn();
    const updateDueDate = vi.fn();
    const updateTaskPosition = vi.fn();
    const updateContent = vi.fn();
    const mutating = signal(false);
    const userId = signal<string | null>('user-1');

    beforeEach(async () => {
        projects.set([]);
        mutating.set(false);
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
        updateTaskPosition.mockReset().mockImplementation(async (t: Task, field: TaskOrderField, position: number) => {
            tasks.update(items => items.map(item => item.id === t.id ? { ...item, [field]: position } : item));
        });
        updateContent.mockReset().mockImplementation(async (t: Task, content: { title: string; description: string | null }) => {
            tasks.update(items => items.map(item => item.id === t.id ? { ...item, ...content } : item));
        });
        await TestBed.configureTestingModule({
            imports: [TasksPage],
            providers: [
                TaskCreateDialogService,
                { provide: Router, useValue: {} },
                { provide: AuthStore, useValue: { userId } },
                { provide: ProjectsStore, useValue: { projects, projectTree: signal([]) } },
                { provide: CalendarClockService, useValue: { today: signal('2026-11-05') } },
                { provide: TasksStore, useValue: {
                    tasks, updatePlannedDate, updateDueDate, updateTaskPosition, updateContent, mutating, error: signal(null), loading: signal(false),
                    realtimeConnected: signal(false),
                } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(TasksPage);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('view', 'today');
        await fixture.whenStable();
    });

    it('shows project names verbatim and retains the missing/loading fallback', () => {
        fixture.componentRef.setInput('view', 'project');
        fixture.componentRef.setInput('projectId', 'project-1');
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe('Project');
        const name = 'ToDo App: "Life is too Short"';
        projects.set([{ id: 'project-1', name } as Project]);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe(name);
        projects.set([]);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe('Project');
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('routes Delete from More actions through the existing confirmation before mutating', async () => {
        const confirm = vi.spyOn(fixture.debugElement.injector.get(ConfirmationService), 'confirm');
        fixture.detectChanges();
        fixture.nativeElement.querySelector('.more-actions-btn').click();
        fixture.detectChanges();
        (document.querySelectorAll('[role="menuitem"] a')[1] as HTMLElement).click();
        fixture.detectChanges();
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(confirm.mock.calls[0][0]).toMatchObject({ header: 'Delete task?', acceptLabel: 'Delete', rejectLabel: 'Cancel' });
        await fixture.whenStable();
        expect(document.body.textContent).toContain('Delete task?');
    });

    it('retains both failed content drafts for retry, catches the failure and renders the confirmed Markdown', async () => {
        tasks.set([task('description-task', '2026-11-05', { description: '**Original**' })]);
        fixture.detectChanges();
        fixture.nativeElement.querySelector('.more-actions-btn').click();
        fixture.detectChanges();
        (document.querySelector('[role="menuitem"] a') as HTMLElement).click();
        fixture.detectChanges();
        const textarea = fixture.nativeElement.querySelector('textarea');
        const title = fixture.nativeElement.querySelector('input[aria-label="Task title"]');
        title.value = 'Updated title';
        title.dispatchEvent(new Event('input'));
        textarea.value = '- **Draft**\n- Second';
        textarea.dispatchEvent(new Event('input'));
        let fail!: (reason: Error) => void;
        updateContent.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
        const form = fixture.nativeElement.querySelector('.task-content-form');
        const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        submit();
        submit();
        expect(updateContent).toHaveBeenCalledTimes(1);
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Saving task');
        fail(new Error('Offline'));
        await fixture.whenStable();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('textarea').value).toBe('- **Draft**\n- Second');
        expect(fixture.nativeElement.querySelector('.task-content-form [role="alert"]').textContent).toContain('Could not save');
        expect(tasks()[0].description).toBe('**Original**');
        expect(title.value).toBe('Updated title');
        submit();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(updateContent).toHaveBeenCalledTimes(2);
        expect(updateContent).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'description-task' }), { title: 'Updated title', description: '- **Draft**\n- Second' });
        expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
        expect(fixture.nativeElement.querySelector('.markdown-content strong').textContent).toBe('Draft');
    });

    it('does not carry content save feedback into another account', async () => {
        fixture.detectChanges();
        fixture.nativeElement.querySelector('.more-actions-btn').click();
        fixture.detectChanges();
        (document.querySelector('[role="menuitem"] a') as HTMLElement).click();
        fixture.detectChanges();
        const textarea = fixture.nativeElement.querySelector('textarea');
        textarea.value = 'Old account draft';
        textarea.dispatchEvent(new Event('input'));
        let fail!: (reason: Error) => void;
        updateContent.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
        fixture.nativeElement.querySelector('.task-content-form').dispatchEvent(new Event('submit', { cancelable: true }));
        userId.set('user-2');
        fixture.detectChanges();
        fail(new Error('Old account error'));
        await fixture.whenStable();
        expect(component['contentFeedback']()).toEqual({});
    });

    function todayList() {
        return fixture.debugElement.queryAll(By.directive(TaskListComponent))
            .find(el => el.componentInstance.dropListId() === 'board-today')!;
    }

    it.each(['focus', 'planning'] as const)('shows ordered Planned and Due subsections in %s without changing placement', layout => {
        tasks.set([
            task('planned-both', '2026-11-05', { due_date: '2026-11-05', planned_position: 30 }),
            task('due-only', null, { due_date: '2026-11-05', planned_position: -100 }),
            task('planned-only', '2026-11-05', { planned_position: 10 }),
            task('planned-overdue', '2026-11-05', { due_date: '2026-11-04', planned_position: 20 }),
            task('unplanned-overdue', null, { due_date: '2026-11-04' }),
            task('future-overdue', '2026-11-06', { due_date: '2026-11-04' }),
            task('completed', '2026-11-05', { is_done: true }),
        ]);
        component['setTodayLayout'](layout);
        fixture.detectChanges();
        const today = todayList();
        expect(today.componentInstance.groups().map((group: { tasks: Task[] }) => group.tasks.map(t => t.id)))
            .toEqual([['planned-only', 'planned-overdue', 'planned-both'], ['due-only']]);
        expect(today.nativeElement.querySelectorAll('h3')).toHaveLength(2);
        expect(today.nativeElement.textContent).toContain('Planned for today');
        expect(today.nativeElement.textContent).toContain('Due today · Not planned');
        expect(fixture.nativeElement.querySelector('#today-heading').textContent).toContain('Today (4)');
        expect(today.queryAll(By.directive(CdkDropList))).toHaveLength(1);
        const rows = today.queryAll(By.directive(TaskRowComponent));
        expect(rows.map(row => row.componentInstance.task().id)).toEqual(['planned-only', 'planned-overdue', 'planned-both', 'due-only']);
        const overdueRow = rows.find(row => row.componentInstance.task().id === 'planned-overdue')!;
        expect(overdueRow.nativeElement.querySelector('.p-tag-danger')).toBeTruthy();
        expect(component['overdueTasks']().map(t => t.id)).toEqual(['unplanned-overdue']);
        expect(component['upcomingDays']()[1].tasks.map(t => t.id)).toEqual(['future-overdue']);
        expect(fixture.nativeElement.querySelectorAll('.today-board__column')).toHaveLength(layout === 'planning' ? 3 : 1);
    });

    it.each(['planned', 'due', 'empty'])('handles the %s single-group or empty state without empty headings', state => {
        tasks.set(state === 'planned' ? [task('one', '2026-11-05')] :
            state === 'due' ? [task('one', null, { due_date: '2026-11-05' })] : []);
        fixture.detectChanges();
        const today = todayList();
        expect(today.nativeElement.querySelectorAll('h3')).toHaveLength(state === 'empty' ? 0 : state === 'due' ? 2 : 1);
        expect(today.nativeElement.textContent).toContain(state === 'planned' ? 'Planned for today' :
            state === 'due' ? 'Due today · Not planned' : 'Nothing for today.');
        expect(fixture.nativeElement.querySelector('#today-heading').textContent).toContain(state === 'empty' ? '(0)' : '(1)');
    });

    it('clearing Today moves a due-today task between subsections while removing a task with no deadline', async () => {
        tasks.set([
            task('planned-both', '2026-11-05', { due_date: '2026-11-05' }),
            task('planned-only', '2026-11-05'),
        ]);
        component['setTodayLayout']('planning');
        fixture.detectChanges();
        const clear = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
            .find(button => button.textContent?.includes("Clear Today's Schedule"))!;
        clear.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(todayList().componentInstance.groups().map((group: { tasks: Task[] }) => group.tasks.map(t => t.id)))
            .toEqual([[], ['planned-both']]);
        expect(todayList().nativeElement.querySelector('.list__planning-target').textContent).toContain('Planned for today');
        expect(fixture.nativeElement.querySelector('#today-heading').textContent).toContain('(1)');
        expect(component['unscheduledTasks']().map(t => t.id)).toEqual(['planned-only']);
        expect(tasks().find(t => t.id === 'planned-both')?.due_date).toBe('2026-11-05');
    });

    it.each([
        ['beginning', 0, null, 'shower', 0, ['amazon', 'shower', 'breakfast', 'garbage']],
        ['middle', 2, 'breakfast', 'garbage', 2500, ['shower', 'breakfast', 'amazon', 'garbage']],
        ['end', 3, 'garbage', null, 4000, ['shower', 'breakfast', 'garbage', 'amazon']],
    ])('plans a due-only task at the %s through one scheduling operation', async (where, index, previousTaskId, nextTaskId, position, order) => {
        tasks.set([
            task('shower', '2026-11-05', { planned_position: 1000 }),
            task('breakfast', '2026-11-05', { planned_position: 2000 }),
            task('garbage', '2026-11-05', { planned_position: 3000 }),
            task('amazon', null, { due_date: '2026-11-05', planned_position: 9000 }),
        ]);
        updatePlannedDate.mockImplementationOnce(async (t: Task, date: string) => {
            mutating.set(true);
            tasks.update(items => items.map(item => item.id === t.id ? { ...item, planned_date: date, planned_position: position as number } : item));
            await Promise.resolve();
            mutating.set(false);
        });
        fixture.detectChanges();
        const today = todayList();
        const dropElement = today.query(By.directive(CdkDropList));
        const drop = dropElement.injector.get(CdkDropList<Task[]>);
        const drag = today.queryAll(By.directive(CdkDrag)).find(el => el.injector.get(CdkDrag).data.id === 'amazon')!
            .injector.get(CdkDrag<Task>);
        const target = today.nativeElement.querySelector('.list__planning-target');
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 200, top: 100, bottom: 140, height: 40, width: 200 });
        const event = {
            item: drag, previousContainer: drop, container: drop, previousIndex: 3, currentIndex: index,
            dropPoint: where === 'end' ? { x: 50, y: 120 } : { x: 50, y: 20 },
        };
        dropElement.triggerEventHandler('cdkDropListDropped', event);
        dropElement.triggerEventHandler('cdkDropListDropped', event);
        await fixture.whenStable();
        fixture.detectChanges();
        expect(updatePlannedDate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'amazon' }), '2026-11-05', {
            previousTaskId, nextTaskId,
        });
        expect(updateTaskPosition).not.toHaveBeenCalled();
        expect(updateDueDate).not.toHaveBeenCalled();
        expect(todayList().componentInstance.groups()[0].tasks.map((t: Task) => t.id)).toEqual(order);
        expect(todayList().componentInstance.groups()[1].tasks).toEqual([]);
        expect(tasks().find(t => t.id === 'amazon')?.due_date).toBe('2026-11-05');
    });

    it('reorders only against neighbors in the same Today subsection and preserves cross-column scheduling', async () => {
        tasks.set([
            task('p1', '2026-11-05', { planned_position: 5000, due_date: '2026-11-05' }),
            task('p2', '2026-11-05', { planned_position: 6000 }),
            task('d1', null, { due_date: '2026-11-05', planned_position: 1000 }),
            task('d2', null, { due_date: '2026-11-05', planned_position: 2000 }),
            task('unscheduled', null),
        ]);
        component['setTodayLayout']('planning');
        fixture.detectChanges();
        const today = todayList();
        const dropElement = today.query(By.directive(CdkDropList));
        const drop = dropElement.injector.get(CdkDropList<Task[]>);
        const drag = today.queryAll(By.directive(CdkDrag)).find(el => el.injector.get(CdkDrag).data.id === 'd2')!
            .injector.get(CdkDrag<Task>);
        dropElement.triggerEventHandler('cdkDropListDropped', {
            item: drag, previousContainer: drop, container: drop, previousIndex: 3, currentIndex: 2,
        });
        await fixture.whenStable();
        fixture.detectChanges();
        expect(updateTaskPosition).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'd2' }), 'planned_position', 0);
        const source = fixture.debugElement.queryAll(By.directive(TaskListComponent))
            .find(el => el.componentInstance.dropListId() === 'board-unscheduled')!;
        const sourceDrop = source.query(By.directive(CdkDropList)).injector.get(CdkDropList<Task[]>);
        const external = source.query(By.directive(CdkDrag)).injector.get(CdkDrag<Task>);
        dropElement.triggerEventHandler('cdkDropListDropped', {
            item: external, previousContainer: sourceDrop, container: drop, previousIndex: 0, currentIndex: 3,
        });
        await fixture.whenStable();
        fixture.detectChanges();
        expect(updatePlannedDate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'unscheduled' }), '2026-11-05');
        expect(todayList().componentInstance.groups()[0].tasks.map((t: Task) => t.id)).toContain('unscheduled');
        const outgoing = todayList().queryAll(By.directive(CdkDrag))
            .find(el => el.injector.get(CdkDrag).data.id === 'p1')!.injector.get(CdkDrag<Task>);
        source.query(By.directive(CdkDropList)).triggerEventHandler('cdkDropListDropped', {
            item: outgoing, previousContainer: drop, container: sourceDrop, previousIndex: 0, currentIndex: 0,
        });
        await fixture.whenStable();
        fixture.detectChanges();
        expect(updatePlannedDate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p1' }), null);
        expect(todayList().componentInstance.groups()[1].tasks.map((t: Task) => t.id)).toContain('p1');
        expect(tasks().find(t => t.id === 'p1')?.due_date).toBe('2026-11-05');
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

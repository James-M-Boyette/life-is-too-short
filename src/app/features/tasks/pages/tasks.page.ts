/* ToDo:
    [x] Extract 'TaskView'

 */
import { Component, signal, inject, computed, input, effect, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '@/shared/supabase/auth.store';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import { Router } from '@angular/router';
import { TasksHeaderComponent } from '@/features/tasks/components/tasks-header/tasks-header.component';
import { ProjectsStore } from '@/features/projects/state/projects.store';
import { ButtonModule } from 'primeng/button';

import type { TaskView } from '@/features/tasks/models/task-view.model';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import { getTaskDisplayDate, getTaskDateGroup } from '@/features/tasks/utils/task-scheduling.util';
import { addLocalDays, parseLocalDate } from '@/shared/utils/date.util';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { TaskListComponent } from '@/features/tasks/components/task-list/task-list.component';
import type { TaskScheduleDrop } from '@/features/tasks/models/task-schedule-drop.model';
import type { TaskReorder } from '@/features/tasks/models/task-reorder.model';
import type { TaskCreateContext } from '../models/task-create-context.model';

import {
    calculateTaskPosition,
    sortTasksByPosition,
} from '@/features/tasks/utils/task-ordering.util';

import { TaskCreateDialogService } from '@/features/tasks/services/task-create-dialog.service';
import { Popover, PopoverModule } from 'primeng/popover';
import { TaskSchedulerComponent } from '@/features/tasks/components/task-scheduler/task-scheduler.component';
import type { Task } from '@/features/tasks/models/tasks.model';
import type { TaskDateSelection, TaskScheduleRequest } from '@/features/tasks/models/task-schedule.model';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        TasksHeaderComponent,
        TaskListComponent,
        ConfirmDialogModule,
        PopoverModule,
        TaskSchedulerComponent,
    ],
    providers: [ConfirmationService],
    templateUrl: './tasks.page.html',
    styleUrls: ['./tasks.page.scss'],
})
export class TasksPage {
    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly schedulePopover = viewChild<Popover>('schedulePopover');
    private readonly scheduleContext = signal<{ taskId: string; userId: string } | null>(null);
    protected readonly activeScheduleTask = computed(() => {
        const context = this.scheduleContext();
        if (!context || context.userId !== this.auth.userId()) return null;
        return this.tasksStore.tasks().find(task => task.id === context.taskId && task.user_id === context.userId) ?? null;
    });
    protected readonly persistedScheduleTask = signal<Task | null>(null);
    protected readonly scheduleSaving = signal(false);
    protected readonly scheduleError = signal<string | null>(null);
    private failedSelection: TaskDateSelection | null = null;
    private saveVersion = 0;
    private pendingScheduleSnapshot: Task | null = null;
    private restoreScheduleFocus = false;

    constructor() {
        let previousUser = this.auth.userId();
        effect(() => {
            const userId = this.auth.userId();
            if (userId !== previousUser) {
                previousUser = userId;
                this.saveVersion++;
                this.scheduleSaving.set(false);
                this.scheduleContext.set(null);
                this.persistedScheduleTask.set(null);
                this.scheduleError.set(null);
                this.failedSelection = null;
                this.pendingScheduleSnapshot = null;
                this.schedulePopover()?.hide();
            }
        });
        effect(() => {
            const task = this.activeScheduleTask();
            if (this.scheduleContext() && !task) {
                this.schedulePopover()?.hide();
            }
            if (task && !this.scheduleSaving()) this.persistedScheduleTask.set(task);
        });
    }

    protected openSchedule(request: TaskScheduleRequest): void {
        const userId = this.auth.userId();
        const task = this.tasksStore.tasks().find(task => task.id === request.taskId && task.user_id === userId);
        if (!userId || !task) return;
        request.event.stopPropagation();
        const popover = this.schedulePopover();
        if (popover?.overlayVisible && this.scheduleContext()?.taskId === task.id) {
            this.closeSchedule(request.event);
            return;
        }
        this.scheduleContext.set({ taskId: task.id, userId });
        this.persistedScheduleTask.set(this.pendingScheduleSnapshot?.id === task.id ? this.pendingScheduleSnapshot : task);
        this.scheduleError.set(null);
        this.failedSelection = null;
        this.restoreScheduleFocus = false;
        popover?.show(request.event, request.anchor);
        if (popover?.container) popover.align();
    }

    protected closeSchedule(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        this.restoreScheduleFocus = true;
        this.schedulePopover()?.hide();
    }

    protected onScheduleHidden(): void {
        if (this.schedulePopover()?.overlayVisible) return;
        const context = this.scheduleContext();
        const document = this.element.nativeElement.ownerDocument;
        const focused = document.activeElement;
        if (context?.userId === this.auth.userId() &&
            (this.restoreScheduleFocus || focused === document.body || focused?.closest('app-task-scheduler'))) {
            const trigger = Array.from(this.element.nativeElement.querySelectorAll<HTMLButtonElement>('[data-schedule-task-id]'))
                .find(button => button.dataset['scheduleTaskId'] === context.taskId && !button.disabled);
            (trigger ?? this.element.nativeElement.querySelector<HTMLElement>('.tasks-page'))?.focus();
        }
        this.scheduleContext.set(null);
        this.persistedScheduleTask.set(null);
        this.scheduleError.set(null);
        this.failedSelection = null;
        this.restoreScheduleFocus = false;
    }

    protected retrySchedule(): void {
        if (this.failedSelection) void this.saveSchedule(this.failedSelection);
    }

    protected async saveSchedule(selection: TaskDateSelection): Promise<void> {
        const task = this.activeScheduleTask();
        const context = this.scheduleContext();
        if (!task || !context || this.scheduleSaving() || this.tasksStore.mutating() || this.bulkScheduleBusy()) return;
        if (task[selection.field] === selection.date) {
            this.scheduleError.set(null);
            this.failedSelection = null;
            return;
        }
        const version = ++this.saveVersion;
        this.pendingScheduleSnapshot = task;
        this.scheduleSaving.set(true);
        this.scheduleError.set(null);
        this.failedSelection = null;
        try {
            if (selection.field === 'planned_date') {
                await this.tasksStore.updatePlannedDate(task, selection.date);
            } else {
                await this.tasksStore.updateDueDate(task, selection.date);
            }
        } catch {
            if (version === this.saveVersion && this.scheduleContext() === context && this.auth.userId() === context.userId) {
                const field = selection.field === 'planned_date' ? 'planned' : 'due';
                this.scheduleError.set(`Could not save the ${field} date. Your previous date has been restored. Try again.`);
                this.failedSelection = selection;
            }
        } finally {
            if (version === this.saveVersion) {
                this.pendingScheduleSnapshot = null;
                this.scheduleSaving.set(false);
            }
        }
    }

    protected readonly auth = inject(AuthStore);
    protected readonly tasksStore = inject(TasksStore);
    protected readonly projectsStore = inject(ProjectsStore);
    readonly error = signal<string | null>(null);
    protected readonly calendarClock = inject(CalendarClockService);

    private readonly confirmationService = inject(ConfirmationService);

    private readonly taskCreateDialog = inject(TaskCreateDialogService);

    protected openTaskDialog(context: TaskCreateContext): void {
        this.taskCreateDialog.open(context);
    }

    readonly pageHeader = computed(() => {
        if (this.view() === 'all') {
            return 'All Tasks';
        } else if (this.view() === 'inbox') {
            return 'Inbox';
        } else if (this.view() === 'today') {
            return 'Today';
        } else if (this.view() === 'upcoming') {
            return 'Upcoming';
        } else if (this.view() === 'project') {
            const projectId = this.projectId();
            const project = this.projectsStore.projects().find((p) => p.id === projectId);
            return project ? `Project: ${project.name}` : 'Project';
        } else {
            return 'Tasks';
        }
    });
    protected readonly todayLayout = signal<'focus' | 'planning'>('focus');

    protected readonly isTodayPlanning = computed(() => this.todayLayout() === 'planning');

    protected readonly reschedulingOverdue = signal(false);
    protected readonly overdueRescheduleError = signal<string | null>(null);
    protected readonly reschedulingUnscheduled = signal(false);
    protected readonly unscheduledRescheduleError = signal<string | null>(null);
    protected readonly clearingToday = signal(false);
    protected readonly clearTodayError = signal<string | null>(null);
    protected readonly clearableTodayTasks = computed(() =>
        this.todayTasks().filter(task => task.planned_date !== null),
    );
    protected readonly bulkScheduleBusy = computed(() =>
        this.reschedulingOverdue() || this.reschedulingUnscheduled() || this.clearingToday(),
    );

    protected async rescheduleOverdueToToday(): Promise<void> {
        await this.updateGroupSchedule('overdue');
    }

    protected async rescheduleUnscheduledToToday(): Promise<void> {
        await this.updateGroupSchedule('unscheduled');
    }

    protected async clearTodaySchedule(): Promise<void> {
        await this.updateGroupSchedule('today');
    }

    private async updateGroupSchedule(group: 'overdue' | 'unscheduled' | 'today'): Promise<void> {
        if (this.view() !== 'today' || !this.isTodayPlanning() ||
            this.bulkScheduleBusy() || this.tasksStore.mutating()) {
            return;
        }

        const tasks = [...(group === 'today' ? this.clearableTodayTasks() :
            group === 'overdue' ? this.overdueTasks() : this.unscheduledTasks())];
        const rescheduling = group === 'today' ? this.clearingToday :
            group === 'overdue' ? this.reschedulingOverdue : this.reschedulingUnscheduled;
        const rescheduleError = group === 'today' ? this.clearTodayError :
            group === 'overdue' ? this.overdueRescheduleError : this.unscheduledRescheduleError;
        const plannedDate = group === 'today' ? null : this.calendarClock.today();
        const userId = this.auth.userId();
        rescheduling.set(true);
        rescheduleError.set(null);
        let updated = 0;

        try {
            // Save in sequence so each task receives its own position in its destination list.
            for (const task of tasks) {
                if (this.auth.userId() !== userId) return;
                await this.tasksStore.updatePlannedDate(task, plannedDate);
                updated++;
            }
        } catch {
            if (this.auth.userId() === userId) {
                rescheduleError.set(
                    group === 'today'
                        ? `Cleared planned dates for ${updated} of ${tasks.length} tasks. Could not save the next task. Please try again.`
                        : `Rescheduled ${updated} of ${tasks.length} tasks. Could not save the next task. Please try again.`,
                );
            }
        } finally {
            rescheduling.set(false);
        }
    }

    protected setTodayLayout(layout: 'focus' | 'planning'): void {
        this.todayLayout.set(layout);
    }
    readonly projectId = input<string | undefined>();
    protected readonly openTasks = computed(() =>
        this.visibleTasks().filter((task) => !task.is_done),
    );

    protected readonly completedTasks = computed(() =>
        this.visibleTasks().filter((task) => task.is_done),
    );

    protected readonly todayDropLists = ['board-today', 'board-unscheduled', 'board-overdue'];

    protected readonly upcomingDropLists = [
        'board-upcoming-0',
        'board-upcoming-1',
        'board-upcoming-2',
    ];

    protected async onTaskDropped(event: TaskScheduleDrop): Promise<void> {
        if (event.task.planned_date === event.plannedDate) {
            return;
        }

        try {
            await this.tasksStore.updatePlannedDate(event.task, event.plannedDate);
        } catch (error) {
            // The store records the error and rolls back the optimistic update.
            console.error('Could not reschedule task:', error);
        }
    }

    protected async onTaskReordered(event: TaskReorder): Promise<void> {
        const { task, previousIndex, currentIndex, tasks, field } = event;

        // Work on a copy. Never mutate a signal-derived input array.
        const reordered = [...tasks];

        const [movedTask] = reordered.splice(previousIndex, 1);
        reordered.splice(currentIndex, 0, movedTask);

        const previousTask = reordered[currentIndex - 1] ?? null;
        const nextTask = reordered[currentIndex + 1] ?? null;

        try {
            // A missing position is not a valid neighbor boundary.
            // We'll handle new-task position initialization separately.
            if (
                (previousTask && previousTask[field] === null) ||
                (nextTask && nextTask[field] === null)
            ) {
                throw new Error('Cannot reorder tasks with uninitialized positions');
            }

            const newPosition = calculateTaskPosition(
                previousTask?.[field] ?? null,
                nextTask?.[field] ?? null,
            );

            await this.tasksStore.updateTaskPosition(task, field, newPosition);
        } catch (error) {
            console.error('Could not reorder task:', error);
            // Store errors are recorded by TasksStore; calculation errors
            // also need a user-visible message before this is production-ready.
        }
    }

    protected readonly showCompleted = signal(false);

    readonly view = input<TaskView>('all');
    private readonly router = inject(Router);

    protected async signOut() {
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
    }

    protected readonly visibleTasks = computed(() => {
        const tasks = this.tasksStore.tasks();
        const view = this.view();

        switch (view) {
            case 'inbox':
                return sortTasksByPosition(
                    tasks.filter((task) => task.project_id === null),
                    'project_position',
                );

            case 'project': {
                const projectId = this.projectId();

                if (!projectId) {
                    return [];
                }

                return sortTasksByPosition(
                    tasks.filter((task) => task.project_id === projectId),
                    'project_position',
                );
            }

            case 'all':
            default:
                return tasks;
        }
    });

    protected readonly todayTasks = computed(() =>
        sortTasksByPosition(
            this.tasksStore
                .tasks()
                .filter(
                    (task) =>
                        !task.is_done &&
                        getTaskDateGroup(task, this.calendarClock.today()) === 'today',
                ),
            'planned_position',
        ),
    );

    protected readonly unscheduledTasks = computed(() =>
        sortTasksByPosition(
            this.tasksStore
                .tasks()
                .filter(
                    (task) =>
                        !task.is_done &&
                        getTaskDateGroup(task, this.calendarClock.today()) === 'unscheduled',
                ),
            'planned_position',
        ),
    );

    protected readonly overdueTasks = computed(() =>
        this.tasksStore
            .tasks()
            .filter(
                (task) =>
                    !task.is_done &&
                    getTaskDateGroup(task, this.calendarClock.today()) === 'overdue',
            ),
    );

    protected readonly upcomingDays = computed(() => {
        const today = this.calendarClock.today();
        const tasks = this.tasksStore.tasks().filter((task) => !task.is_done);

        return [
            { label: 'Today', date: today },
            { label: 'Tomorrow', date: addLocalDays(today, 1) },
            { label: '', date: addLocalDays(today, 2) },
        ].map((day) => ({
            ...day,
            displayDate: parseLocalDate(day.date),
            tasks: sortTasksByPosition(
                tasks.filter((task) => getTaskDisplayDate(task) === day.date),
                'planned_position',
            ),
        }));
    });

    protected confirmDeleteTask(taskId: string): void {
        this.confirmationService.confirm({
            header: 'Delete task?',
            message: `Are you sure you want to delete this task? \n
            This action cannot be undone.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Delete',
            rejectLabel: 'Cancel',
            acceptButtonStyleClass: 'p-button-danger',
            rejectButtonStyleClass: 'p-button-text',
            accept: () => {
                void this.tasksStore.remove(taskId);
            },
        });
    }
}

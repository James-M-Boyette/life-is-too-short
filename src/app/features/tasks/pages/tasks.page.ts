/* ToDo:
    [x] Extract 'TaskView'

 */
import { Component, signal, inject, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '@/shared/supabase/auth.store';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import { Router } from '@angular/router';
import { TasksHeaderComponent } from '@/features/tasks/components/tasks-header/tasks-header.component';
import {
    TaskCreateComponent,
    CreateTaskPayload,
} from '@/features/tasks/components/task-create/task-create.component';
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

import {
    calculateTaskPosition,
    sortTasksByPosition,
} from '@/features/tasks/utils/task-ordering.util';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        TasksHeaderComponent,
        TaskCreateComponent,
        TaskListComponent,
        ConfirmDialogModule,
    ],
    providers: [ConfirmationService],
    templateUrl: './tasks.page.html',
    styleUrls: ['./tasks.page.scss'],
})
export class TasksPage {
    protected readonly auth = inject(AuthStore);
    protected readonly tasksStore = inject(TasksStore);
    protected readonly projectsStore = inject(ProjectsStore);
    readonly error = signal<string | null>(null); // Did creating a Task fail?
    protected readonly calendarClock = inject(CalendarClockService);

    private readonly confirmationService = inject(ConfirmationService);

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

            await this.tasksStore.updateTaskPosition(
            task,
            field,
            newPosition,
        );
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

    protected async createTask(payload: CreateTaskPayload) {
        try {
            await this.tasksStore.addTask(payload);
        } catch (e: unknown) {
            this.error.set(e instanceof Error ? e.message : 'Failed to load tasks');
            console.log(
                `🚨 Error creating the task: ${e instanceof Error ? e.message : 'Unknown error'}`,
            );
            throw e;
        }
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
            this.tasksStore.tasks().filter(
                (task) =>
                    !task.is_done &&
                    getTaskDateGroup(
                        task,
                        this.calendarClock.today(),
                    ) === 'today',
            ),
            'planned_position',
        ),
    );

    protected readonly unscheduledTasks = computed(() =>
        sortTasksByPosition(
            this.tasksStore.tasks().filter(
                (task) =>
                    !task.is_done &&
                    getTaskDateGroup(
                        task,
                        this.calendarClock.today(),
                    ) === 'unscheduled',
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
        const tasks = this.tasksStore.tasks().
            filter((task) => !task.is_done);

        return [
            { label: 'Today', date: today },
            { label: 'Tomorrow', date: addLocalDays(today, 1) },
            { label: '', date: addLocalDays(today, 2) },
        ].map((day) => ({
            ...day,
            displayDate: parseLocalDate(day.date),
            tasks: sortTasksByPosition(
                tasks.filter(
                    (task) => getTaskDisplayDate(task) === day.date,
                ),
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

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
import { TaskRowComponent } from '@/features/tasks/components/task-row/task-row.component';
import { ProjectsStore } from '@/features/projects/state/projects.store';
import { ButtonModule } from 'primeng/button';

import type { TaskView } from '@/features/tasks/models/task-view.model';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import {
    getTaskDateGroup,
} from '@/features/tasks/utils/task-scheduling.util';
import {
    addLocalDays,
    parseLocalDate,
} from '@/features/tasks/utils/task-date.util';
import { getTaskDisplayDate } from '@/features/tasks/utils/task-scheduling.util';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        TasksHeaderComponent,
        TaskCreateComponent,
        TaskRowComponent,

    ],
    templateUrl: './tasks.page.html',
    styleUrls: ['./tasks.page.scss'],
})
export class TasksPage {
    protected readonly auth = inject(AuthStore);
    protected readonly tasksStore = inject(TasksStore);
    protected readonly projectsStore = inject(ProjectsStore);
    readonly error = signal<string | null>(null); // Did creating a Task fail?
    protected readonly calendarClock = inject(CalendarClockService);

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

    protected readonly showCompleted = signal(false);

    readonly view = input<TaskView>('all');
    private readonly router = inject(Router);

    constructor() {}

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
                return tasks.filter((task) => task.project_id === null);

            case 'project': {
                const projectId = this.projectId();

                if (!projectId) {
                    return [];
                }

                return tasks.filter((task) => task.project_id === projectId);
            }

            case 'all':
            default:
                return tasks;
        }
    });

    protected readonly todayTasks = computed(() =>
        this.tasksStore.tasks().filter(
            (task) =>
                !task.is_done &&
                getTaskDateGroup(task, this.calendarClock.today()) === 'today',
        ),
    );

    protected readonly unscheduledTasks = computed(() =>
        this.tasksStore.tasks().filter(
            (task) =>
                !task.is_done &&
                getTaskDateGroup(task, this.calendarClock.today()) === 'unscheduled',
        ),
    );

    protected readonly overdueTasks = computed(() =>
        this.tasksStore.tasks().filter(
            (task) =>
                !task.is_done &&
                getTaskDateGroup(task, this.calendarClock.today()) === 'overdue',
        ),
    );

    protected readonly upcomingDays = computed(() => {
        // const today = this.calendarClock.today();
        // const tasks = this.tasksStore.tasks().filter((task) => !task.is_done);

        // return [
        //     { label: 'Today', date: today },
        //     { label: 'Tomorrow', date: addLocalDays(today, 1) },
        //     { label: 'Day After Tomorrow', date: addLocalDays(today, 2) },
        // ].map((day) => ({
        //     ...day,
        //     tasks: tasks.filter(
        //         (task) => getTaskDisplayDate(task) === day.date,
        //     ),
        // }));

        const today = this.calendarClock.today();
        const tasks = this.tasksStore.tasks().filter((task) => !task.is_done);

        return [
            { label: 'Today', date: today },
            { label: 'Tomorrow', date: addLocalDays(today, 1) },
            { label: '', date: addLocalDays(today, 2) },
        ].map((day) => ({
            ...day,
            displayDate: parseLocalDate(day.date),
            tasks: tasks.filter(
                (task) => getTaskDisplayDate(task) === day.date,
            ),
        }));
    });
}

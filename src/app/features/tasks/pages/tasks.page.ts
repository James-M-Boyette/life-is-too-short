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

import type { TaskView } from '@/features/tasks/models/task-view.model';

@Component({
    standalone: true,
    imports: [CommonModule, TasksHeaderComponent, TaskCreateComponent, TaskRowComponent],
    templateUrl: './tasks.page.html',
    styleUrls: ['./tasks.page.scss'],
})
export class TasksPage {
    protected readonly auth = inject(AuthStore);
    protected readonly tasksStore = inject(TasksStore);
    protected readonly projectsStore = inject(ProjectsStore);
    readonly error = signal<string | null>(null); // Did creating a Task fail?

    readonly projectId = input<string | undefined>();

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
}

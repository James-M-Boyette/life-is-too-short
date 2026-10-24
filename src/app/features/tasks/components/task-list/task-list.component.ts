import { Component, input, output, computed } from '@angular/core';

import type { Task } from '@/features/tasks/models/tasks.model';
import type { ProjectNode } from '@/features/projects/models/project.model';

import { TaskRowComponent } from '@/features/tasks/components/task-row/task-row.component';

import { JsonPipe } from '@angular/common';

@Component({
    selector: 'app-task-list',
    standalone: true,
    imports: [
        JsonPipe,
        TaskRowComponent,
    ],
    templateUrl: './task-list.component.html',
    styleUrl: './task-list.component.scss',
})
export class TaskListComponent {
    readonly tasks = input.required<Task[]>();
    readonly projects = input<ProjectNode[]>([]);
    readonly disabled = input(false);
    readonly emptyMessage = input('No tasks.');

    readonly toggleDone = output<Task>();
    readonly remove = output<string>();
    readonly rename = output<{ task: Task; title: string }>();

    readonly editDescription = output<{
        task: Task;
        description: string | null;
    }>();

    readonly projectChange = output<{
        task: Task;
        projectId: string | null;
    }>();

    readonly plannedDateChange = output<{
        task: Task;
        plannedDate: string | null;
    }>();

    readonly dueDateChange = output<{
        task: Task;
        dueDate: string | null;
    }>();

    protected readonly debugTasks = computed(() =>
        this.tasks().map((task) => ({
            title: task.title,
            is_done: task.is_done,
        })),
    );
}

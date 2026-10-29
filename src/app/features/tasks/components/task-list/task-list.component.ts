import { Component, input, output, computed } from '@angular/core';

import type { Task } from '@/features/tasks/models/tasks.model';
import type { ProjectNode } from '@/features/projects/models/project.model';

import { TaskRowComponent } from '@/features/tasks/components/task-row/task-row.component';

// import { JsonPipe } from '@angular/common';
import { CdkDropList, CdkDragDrop } from '@angular/cdk/drag-drop';

import type { TaskScheduleDrop } from '@/features/tasks/models/task-schedule-drop.model';
import type { TaskReorder } from '@/features/tasks/models/task-reorder.model';

@Component({
    selector: 'app-task-list',
    standalone: true,
    imports: [TaskRowComponent, CdkDropList],
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

    readonly draggable = input(false);

    readonly dropListId = input('');
    readonly connectedDropLists = input<string[]>([]);

    readonly destinationDate = input<string | null>(null);
    readonly acceptsDrops = input(true);

    readonly taskDropped = output<TaskScheduleDrop>();
    readonly sortable = input(false);

    readonly taskReordered = output<TaskReorder>();

    protected readonly canEnter = () => this.acceptsDrops();

    protected onDrop(event: CdkDragDrop<Task[]>): void {
        const task = event.item.data as Task;

        // A drop within the same list changes manual ordering.
        if (event.previousContainer === event.container) {
            if (!this.sortable() || event.previousIndex === event.currentIndex) {
                return;
            }

            this.taskReordered.emit({
                task,
                previousIndex: event.previousIndex,
                currentIndex: event.currentIndex,
                tasks: event.container.data,
            });

            return;
        }

        // A drop into another column changes scheduling.
        // Preserve our existing horizontal drag-and-drop behavior.
        this.taskDropped.emit({
            task,
            plannedDate: this.destinationDate(),
        });
    }

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

import { Component, input, output, computed } from '@angular/core';

import type { Task } from '@/features/tasks/models/tasks.model';
import type { ProjectNode } from '@/features/projects/models/project.model';

import { TaskRowComponent } from '@/features/tasks/components/task-row/task-row.component';

// import { JsonPipe } from '@angular/common';
import { CdkDropList, CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';

import type { TaskScheduleDrop } from '@/features/tasks/models/task-schedule-drop.model';
import type { TaskReorder } from '@/features/tasks/models/task-reorder.model';
import { TaskOrderField } from '@/features/tasks/utils/task-ordering.util'
import type { TaskScheduleRequest } from '@/features/tasks/models/task-schedule.model';
import type { TaskListGroup } from '@/features/tasks/models/task-list-group.model';

@Component({
    selector: 'app-task-list',
    standalone: true,
    imports: [TaskRowComponent, CdkDropList],
    templateUrl: './task-list.component.html',
    styleUrl: './task-list.component.scss',
})
export class TaskListComponent {
    readonly tasks = input.required<Task[]>();
    readonly groups = input<TaskListGroup[]>([]);
    protected readonly displayTasks = computed(() =>
        this.groups().length ? this.groups().flatMap(group => group.tasks) : this.tasks(),
    );
    protected readonly groupByTask = computed(() => {
        const result = new Map<string, TaskListGroup>();
        for (const group of this.groups()) {
            for (const task of group.tasks) result.set(task.id, group);
        }
        return result;
    });
    protected readonly groupHeaders = computed(() => {
        const result = new Map<string, TaskListGroup>();
        for (const group of this.groups()) {
            if (group.tasks.length) result.set(group.tasks[0].id, group);
        }
        return result;
    });
    readonly projects = input<ProjectNode[]>([]);
    readonly disabled = input(false);
    readonly emptyMessage = input('No tasks.');

    readonly toggleDone = output<Task>();
    readonly remove = output<string>();
    readonly rename = output<{ task: Task; title: string }>();

    readonly draggable = input(false);
    readonly scheduleRequested = output<TaskScheduleRequest>();

    readonly dropListId = input('');
    readonly connectedDropLists = input<string[]>([]);

    readonly destinationDate = input<string | null>(null);
    readonly acceptsDrops = input(true);

    readonly taskDropped = output<TaskScheduleDrop>();
    readonly sortable = input(false);
    readonly orderField = input<TaskOrderField>('planned_position');

    readonly taskReordered = output<TaskReorder>();

    protected readonly canEnter = () => this.acceptsDrops();

    protected readonly canSort = (index: number, drag: CdkDrag<Task>, drop: CdkDropList<Task[]>): boolean => {
        // Entering from another column still changes scheduling, not just manual order.
        if (drag.dropContainer !== drop || !this.groups().length) return true;
        const group = this.groupByTask().get(drag.data.id);
        const target = this.displayTasks()[index];
        return !!group && !!target && this.groupByTask().get(target.id) === group;
    };

    protected onDrop(event: CdkDragDrop<Task[]>): void {
        const task = event.item.data as Task;

        // A drop within the same list changes manual ordering.
        if (event.previousContainer === event.container) {
            if (!this.sortable() || event.previousIndex === event.currentIndex) {
                return;
            }

            let tasks = event.container.data;
            let previousIndex = event.previousIndex;
            let currentIndex = event.currentIndex;
            if (this.groups().length) {
                const group = this.groupByTask().get(task.id);
                const target = tasks[currentIndex];
                if (!group || !target || this.groupByTask().get(target.id) !== group) return;
                // Neighbors in another visual section must not affect this section's positions.
                tasks = tasks.filter(item => this.groupByTask().get(item.id) === group);
                previousIndex = tasks.findIndex(item => item.id === task.id);
                currentIndex = tasks.findIndex(item => item.id === target.id);
                if (previousIndex < 0 || currentIndex < 0 || previousIndex === currentIndex) return;
            }

            this.taskReordered.emit({
                task,
                previousIndex,
                currentIndex,
                tasks,
                field: this.orderField(),
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


    protected readonly debugTasks = computed(() =>
        this.tasks().map((task) => ({
            title: task.title,
            is_done: task.is_done,
        })),
    );
}

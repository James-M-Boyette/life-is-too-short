import {
    Component,
    EventEmitter,
    Input,
    Output,
    signal,
    input,
    output,
    computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import type { Task } from '@/features/tasks/models/tasks.model';
import { Project, ProjectNode } from '@/features/projects/models/project.model';
import { toProjectTreeNodes, findTreeNodeByKey } from '@/features/projects/utils/project-tree-node.util';
import { FormsModule } from '@angular/forms';
import { TagModule } from 'primeng/tag';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import { inject } from '@angular/core';
import { TreeSelectModule } from 'primeng/treeselect';
import type { TreeNode } from 'primeng/api';
import { DatePickerModule } from 'primeng/datepicker';
import {
    parseLocalDate,
    formatLocalDate,
} from '@/shared/utils/date.util';
import { PopoverModule } from 'primeng/popover';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        TooltipModule,
        FormsModule,
        TagModule,
        TreeSelectModule,
        DatePickerModule,
        PopoverModule,
    ],
    selector: 'app-task-row',
    templateUrl: './task-row.component.html',
    styleUrls: ['./task-row.component.scss'],
})
export class TaskRowComponent {
    disabled = input<boolean>(false);

    @Output() toggleDone = new EventEmitter<Task>();
    @Output() remove = new EventEmitter<string>();
    @Output() rename = new EventEmitter<{ task: Task; title: string }>();

    protected readonly editing = signal(false);
    protected readonly draftTitle = signal('');
    readonly task = input.required<Task>(); // The current task
    readonly project = input<Project | null>(null); // The project that the current task belongs to (if any)
    readonly projects = input<ProjectNode[]>([]); // The list of all *possible* projects (for the project dropdown)

    protected readonly calendarClock = inject(CalendarClockService);

    protected readonly isDueOverdue = computed(() => {
        const task = this.task();
        const dueDate = task.due_date;

        return (
            !task.is_done &&
            dueDate !== null &&
            dueDate < this.calendarClock.today()
        );
    });

    protected readonly projectOptions = computed(() => toProjectTreeNodes(this.projects()));

    protected readonly selectedProjectNode = computed(() => {
        const projectId = this.task().project_id;

        if (!projectId) {
            return null;
        }

        return findTreeNodeByKey(this.projectOptions(), projectId);
    });

    readonly projectChange = output<{
        task: Task;
        projectId: string | null;
    }>();

    protected onProjectChange(project: TreeNode | null) {
        this.projectChange.emit({
            task: this.task(),
            projectId: project?.key ?? null,
        });
    }

    protected startEdit() {
        if (this.disabled()) return;
        this.draftTitle.set(this.task().title);
        this.editing.set(true);
    }

    protected cancelEdit() {
        this.editing.set(false);
    }

    protected commitEdit() {
        const title = this.draftTitle().trim();
        this.editing.set(false);

        if (!title || title === this.task().title) return;
        this.rename.emit({ task: this.task(), title });
    }

    protected readonly plannedDate = computed(() =>
        parseLocalDate(this.task().planned_date),
    );

    protected readonly dueDate = computed(() =>
        parseLocalDate(this.task().due_date),
    );

    readonly plannedDateChange = output<{
        task: Task;
        plannedDate: string | null;
    }>();

    protected onPlannedDateChange(date: Date | null): void {
        this.plannedDateChange.emit({
            task: this.task(),
            plannedDate: formatLocalDate(date),
        });
    };

    readonly dueDateChange = output<{
        task: Task;
        dueDate: string | null;
    }>();

    protected onDueDateChange(date: Date | null): void {
    this.dueDateChange.emit({
            task: this.task(),
            dueDate: formatLocalDate(date),
        });
    }

    protected onDraftInput(event: Event) {
        const input = event.target as HTMLInputElement;
        this.draftTitle.set(input.value);
    }

    protected onSubmit(event: SubmitEvent) {
        event.preventDefault();
        this.commitEdit();
    }

    @Output() editDescription = new EventEmitter<{ task: Task; description: string | null }>();

    protected readonly editingDescription = signal(false);
    protected readonly draftDescription = signal('');

    protected startDescriptionEdit() {
        if (this.disabled()) return;
        this.draftDescription.set(this.task().description ?? '');
        this.editingDescription.set(true);
    }

    protected cancelDescriptionEdit() {
        this.editingDescription.set(false);
    }

    protected commitDescriptionEdit() {
        const value = this.draftDescription();
        this.editingDescription.set(false);
        this.editDescription.emit({ task: this.task(), description: value });
    }

    protected onDescriptionInput(event: Event) {
        const el = event.target as HTMLTextAreaElement;
        this.draftDescription.set(el.value);
    }

    protected onDescriptionSubmit(event: SubmitEvent) {
        event.preventDefault();
        this.commitDescriptionEdit();
    }
}

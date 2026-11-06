import {
    Component,
    EventEmitter,
    Output,
    signal,
    input,
    output,
    computed,
    effect,
    afterRenderEffect,
    viewChild,
    ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { Menu, MenuModule } from 'primeng/menu';
import type { MenuItem } from 'primeng/api';
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
import {
    parseLocalDate,
} from '@/shared/utils/date.util';
import type { TaskScheduleRequest } from '@/features/tasks/models/task-schedule.model';
import { CdkDrag, CdkDragHandle, } from '@angular/cdk/drag-drop';
import { TaskDescriptionComponent } from '@/features/tasks/components/task-description/task-description.component';
import type { TaskDescriptionChange, TaskDescriptionFeedback } from '@/features/tasks/models/task-description.model';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        MenuModule,
        TooltipModule,
        FormsModule,
        TagModule,
        TreeSelectModule,
        CdkDrag,
        CdkDragHandle,
        TaskDescriptionComponent,
    ],
    selector: 'app-task-row',
    templateUrl: './task-row.component.html',
    styleUrls: ['./task-row.component.scss'],
})
export class TaskRowComponent {
    disabled = input<boolean>(false);
    readonly descriptionFeedback = input<TaskDescriptionFeedback | null>(null);
    private readonly descriptionTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('descriptionTextarea');
    private readonly moreActionsButton = viewChild<ElementRef<HTMLButtonElement>>('moreActionsButton');
    private readonly descriptionEditBaseline = signal(0);
    protected readonly descriptionError = computed(() => {
        const result = this.descriptionFeedback();
        return result && result.attemptId > this.descriptionEditBaseline() ? result.error : null;
    });

    protected readonly actionsMenu = viewChild<Menu>('actionsMenu');
    protected readonly menuItems = computed<MenuItem[]>(() => [
        { label: this.task().description ? 'Edit description' : 'Add description', icon: 'pi pi-pencil',
          disabled: this.disabled() || !!this.descriptionFeedback()?.pending || this.editingDescription(),
          command: () => this.startDescriptionEdit() },
        { label: 'Delete task', icon: 'pi pi-trash', disabled: this.disabled(),
          command: () => {
              if (!this.disabled()) {
                  this.moreActionsButton()?.nativeElement.focus();
                  this.remove.emit(this.task().id);
              }
          } },
    ]);

    protected openActions(event: Event): void {
        if (!this.disabled()) this.actionsMenu()?.toggle(event);
    }

    protected openActionsWithKeyboard(event: Event): void {
        event.preventDefault();
        if (!this.disabled()) this.actionsMenu()?.show(event);
    }

    constructor() {
        effect(() => {
            const result = this.descriptionFeedback();
            if (this.editingDescription() && result && result.attemptId > this.descriptionEditBaseline() &&
                !result.pending && !result.error) this.editingDescription.set(false);
        });
        let wasEditing = false;
        afterRenderEffect(() => {
            const editing = this.editingDescription();
            const textarea = this.descriptionTextarea();
            const button = this.moreActionsButton();
            if (editing && !wasEditing) textarea?.nativeElement.focus();
            if (!editing && wasEditing) button?.nativeElement.focus();
            wasEditing = editing;
        });
    }

    @Output() toggleDone = new EventEmitter<Task>();
    @Output() remove = new EventEmitter<string>();
    @Output() rename = new EventEmitter<{ task: Task; title: string }>();

    protected readonly editing = signal(false);
    protected readonly draftTitle = signal('');
    readonly task = input.required<Task>(); // The current task
    readonly project = input<Project | null>(null); // The project that the current task belongs to (if any)
    readonly projects = input<ProjectNode[]>([]); // The list of all *possible* projects (for the project dropdown)

    protected readonly calendarClock = inject(CalendarClockService);

    readonly draggable = input(false);
    readonly scheduleRequested = output<TaskScheduleRequest>();

    protected openSchedule(event: Event): void {
        if (this.disabled()) return;
        this.scheduleRequested.emit({ taskId: this.task().id, event, anchor: event.currentTarget as HTMLElement });
    }

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


    protected onDraftInput(event: Event) {
        const input = event.target as HTMLInputElement;
        this.draftTitle.set(input.value);
    }

    protected onSubmit(event: SubmitEvent) {
        event.preventDefault();
        this.commitEdit();
    }

    readonly editDescription = output<TaskDescriptionChange>();

    protected readonly editingDescription = signal(false);
    protected readonly draftDescription = signal('');

    protected startDescriptionEdit() {
        if (this.disabled() || this.descriptionFeedback()?.pending || this.editingDescription()) return;
        this.draftDescription.set(this.task().description ?? '');
        this.descriptionEditBaseline.set(this.descriptionFeedback()?.attemptId ?? 0);
        this.editingDescription.set(true);
    }

    protected cancelDescriptionEdit() {
        if (this.descriptionFeedback()?.pending) return;
        this.editingDescription.set(false);
    }

    protected commitDescriptionEdit() {
        if (this.disabled() || this.descriptionFeedback()?.pending) return;
        const value = this.draftDescription();
        const description = value.trim() ? value : null;
        if (description === this.task().description) {
            this.editingDescription.set(false);
            return;
        }
        this.editDescription.emit({ task: this.task(), description });
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

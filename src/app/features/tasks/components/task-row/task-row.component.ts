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
import { TaskContentEditorComponent } from '../task-content-editor/task-content-editor.component';
import { TaskDescriptionComponent } from '@/features/tasks/components/task-description/task-description.component';
import type { TaskContentChange, TaskContentFeedback, TaskContent } from '@/features/tasks/models/task-content.model';

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
        TaskContentEditorComponent,
    ],
    selector: 'app-task-row',
    templateUrl: './task-row.component.html',
    styleUrls: ['./task-row.component.scss'],
})
export class TaskRowComponent {
    disabled = input<boolean>(false);
    readonly contentFeedback = input<TaskContentFeedback | null>(null);
    private readonly titleButton = viewChild<ElementRef<HTMLButtonElement>>('titleButton');
    private readonly moreActionsButton = viewChild<ElementRef<HTMLButtonElement>>('moreActionsButton');
    private readonly contentEditBaseline = signal(0);
    protected readonly contentError = computed(() => {
        const result = this.contentFeedback();
        return result && result.attemptId > this.contentEditBaseline() ? result.error : null;
    });

    protected readonly actionsMenu = viewChild<Menu>('actionsMenu');
    protected readonly menuItems = computed<MenuItem[]>(() => [
        { label: 'Edit task', icon: 'pi pi-pencil',
          disabled: this.disabled() || !!this.contentFeedback()?.pending || this.editing(),
          command: () => this.startEdit('title') },
        { label: 'Delete task', icon: 'pi pi-trash', disabled: this.disabled() || this.editing(),
          command: () => {
              if (!this.disabled() && !this.editing()) {
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
        let editingOwner: string | null = null;
        effect(() => {
            const task = this.task();
            const owner = task.user_id + ':' + task.id;
            if (editingOwner !== null && editingOwner !== owner) this.editing.set(false);
            editingOwner = owner;
            const result = this.contentFeedback();
            if (this.editing() && result && result.attemptId > this.contentEditBaseline() &&
                !result.pending && !result.error) this.editing.set(false);
        });
        let wasEditing = false;
        afterRenderEffect(() => {
            const editing = this.editing();
            const button = this.moreActionsButton();
            if (!editing && wasEditing) {
                const target = this.restoreFocus === 'title' ? this.titleButton() : button;
                target?.nativeElement.focus();
            }
            wasEditing = editing;
        });

    }

    @Output() toggleDone = new EventEmitter<Task>();
    @Output() remove = new EventEmitter<string>();

    protected readonly editing = signal(false);
    protected readonly initialFocus = signal<'title' | 'description'>('title');
    private restoreFocus: 'title' | 'actions' = 'actions';
    readonly task = input.required<Task>(); // The current task
    readonly project = input<Project | null>(null); // The project that the current task belongs to (if any)
    readonly projects = input<ProjectNode[]>([]); // The list of all *possible* projects (for the project dropdown)

    protected readonly calendarClock = inject(CalendarClockService);

    readonly draggable = input(false);
    readonly scheduleRequested = output<TaskScheduleRequest>();

    protected openSchedule(event: Event): void {
        if (this.disabled() || this.editing()) return;
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
        if (this.disabled() || this.editing()) return;
        this.projectChange.emit({
            task: this.task(),
            projectId: project?.key ?? null,
        });
    }

    protected startEdit(focus: 'title' | 'description' = 'title', fromTitle = false): void {
        if (this.disabled() || this.contentFeedback()?.pending || this.editing()) return;
        this.initialFocus.set(focus);
        this.restoreFocus = fromTitle ? 'title' : 'actions';
        this.contentEditBaseline.set(this.contentFeedback()?.attemptId ?? 0);
        this.editing.set(true);
    }

    protected cancelEdit(): void {
        if (!this.contentFeedback()?.pending) this.editing.set(false);
    }

    readonly contentSaved = output<TaskContentChange>();

    protected saveContent(content: TaskContent): void {
        if (this.disabled() || this.contentFeedback()?.pending || !this.editing()) return;
        if (content.title === this.task().title && content.description === this.task().description) {
            this.editing.set(false);
            return;
        }
        this.contentSaved.emit({ task: this.task(), ...content });
    }

    protected readonly plannedDate = computed(() =>
        parseLocalDate(this.task().planned_date),
    );


    protected readonly dueDate = computed(() =>
        parseLocalDate(this.task().due_date),
    );


}

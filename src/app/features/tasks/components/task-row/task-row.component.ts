import { CdkDrag } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
    afterRenderEffect,
    Component,
    computed,
    effect,
    type ElementRef,
    EventEmitter,
    inject,
    input,
    output,
    Output,
    signal,
    viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { MenuItem, TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { TreeSelect, TreeSelectModule } from 'primeng/treeselect';

import type { Project, ProjectNode } from '@/features/projects/models/project.model';
import {
    findTreeNodeByKey,
    toProjectTreeNodes,
} from '@/features/projects/utils/project-tree-node.util';
import { TaskDescriptionComponent } from '@/features/tasks/components/task-description/task-description.component';
import type {
    TaskContent,
    TaskContentChange,
    TaskContentFeedback,
} from '@/features/tasks/models/task-content.model';
import type {
    TaskDateField,
    TaskScheduleRequest,
} from '@/features/tasks/models/task-schedule.model';
import type { Task } from '@/features/tasks/models/tasks.model';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import { parseLocalDate } from '@/shared/utils/date.util';

import { TaskContentEditorComponent } from '../task-content-editor/task-content-editor.component';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        ButtonModule,
        MenuModule,
        TooltipModule,
        FormsModule,
        TagModule,
        TreeSelectModule,
        CdkDrag,
        TaskDescriptionComponent,
        TaskContentEditorComponent,
    ],
    selector: 'app-task-row',
    templateUrl: './task-row.component.html',
    styleUrls: ['./task-row.component.scss'],
})
export class TaskRowComponent {
    protected readonly calendarClock = inject(CalendarClockService);

    readonly task = input.required<Task>(); // The current task
    readonly project = input<Project | null>(null); // The project that the current task belongs to (if any)
    readonly projects = input<ProjectNode[]>([]); // The list of all *possible* projects (for the project dropdown)
    disabled = input<boolean>(false);
    readonly contentFeedback = input<TaskContentFeedback | null>(null);
    readonly draggable = input(false);

    @Output() toggleDone = new EventEmitter<Task>();
    @Output() remove = new EventEmitter<string>();
    readonly scheduleRequested = output<TaskScheduleRequest>();
    readonly contentSaved = output<TaskContentChange>();
    readonly projectChange = output<{
        task: Task;
        projectId: string | null;
    }>();

    private readonly pencilButton = viewChild<ElementRef<HTMLButtonElement>>('pencilButton');
    private readonly titleButton = viewChild<ElementRef<HTMLButtonElement>>('titleButton');
    private readonly moreActionsButton =
        viewChild<ElementRef<HTMLButtonElement>>('moreActionsButton');
    private readonly projectSelect = viewChild<TreeSelect>('projectSelect');
    private readonly projectSelector = viewChild<ElementRef<HTMLElement>>('projectSelector');
    protected readonly actionsMenu = viewChild<Menu>('actionsMenu');

    protected readonly editing = signal(false);
    protected readonly initialFocus = signal<'title' | 'description'>('title');
    private restoreFocus: 'title' | 'pencil' | 'actions' = 'actions';
    private readonly contentEditBaseline = signal(0);
    protected readonly movingProject = signal(false);

    // Keep CDK's movement threshold. A short touch hold lets an ordinary swipe scroll first.
    protected readonly dragStartDelay = { mouse: 0, touch: 200 };

    protected readonly contentError = computed(() => {
        const result = this.contentFeedback();
        return result && result.attemptId > this.contentEditBaseline() ? result.error : null;
    });

    protected readonly projectOptions = computed(() => toProjectTreeNodes(this.projects()));

    protected readonly selectedProjectNode = computed(() => {
        const projectId = this.task().project_id;

        if (!projectId) {
            return null;
        }

        return findTreeNodeByKey(this.projectOptions(), projectId);
    });

    protected readonly projectName = computed(() => {
        const id = this.task().project_id;
        if (!id) return 'Inbox';
        return this.project()?.id === id
            ? this.project()!.name
            : (this.selectedProjectNode()?.label ?? 'Project unavailable');
    });

    protected readonly isDueOverdue = computed(() => {
        const task = this.task();
        const dueDate = task.due_date;

        return !task.is_done && dueDate !== null && dueDate < this.calendarClock.today();
    });

    protected readonly plannedDate = computed(() => parseLocalDate(this.task().planned_date));

    protected readonly dueDate = computed(() => parseLocalDate(this.task().due_date));

    protected readonly menuItems = computed<MenuItem[]>(() => [
        {
            label: 'Edit task',
            icon: 'pi pi-pencil',
            disabled: this.disabled() || !!this.contentFeedback()?.pending || this.editing(),
            command: () => this.startEdit('title'),
        },
        {
            label: 'Move to project',
            icon: 'pi pi-folder',
            disabled: this.disabled() || this.editing(),
            command: () => {
                if (!this.disabled() && !this.editing()) this.movingProject.set(true);
            },
        },
        {
            label: 'Delete task',
            icon: 'pi pi-trash',
            // PrimeNG applies these item-local tokens to both pointer and active-descendant focus states.
            // Inline item styling follows the popup when it is appended to body.
            style: {
                '--p-menu-item-color': 'var(--color-status-danger)',
                '--p-menu-item-icon-color': 'var(--color-status-danger)',
                '--p-menu-item-focus-color': 'var(--color-status-danger-hover)',
                '--p-menu-item-icon-focus-color': 'var(--color-status-danger-hover)',
                '--p-menu-item-focus-background': 'var(--color-status-danger-soft)',
            },
            disabled: this.disabled() || this.editing(),
            command: () => {
                if (!this.disabled() && !this.editing()) {
                    this.moreActionsButton()?.nativeElement.focus();
                    this.remove.emit(this.task().id);
                }
            },
        },
    ]);

    constructor() {
        let editingOwner: string | null = null;
        effect(() => {
            const task = this.task();
            const owner = task.user_id + ':' + task.id;
            if (editingOwner !== null && editingOwner !== owner) {
                this.editing.set(false);
                this.projectSelect()?.hide();
                this.movingProject.set(false);
            }
            editingOwner = owner;
            const result = this.contentFeedback();
            if (
                this.editing() &&
                result &&
                result.attemptId > this.contentEditBaseline() &&
                !result.pending &&
                !result.error
            ) {
                this.editing.set(false);
            }
        });

        let wasMovingProject = false;
        afterRenderEffect(() => {
            const moving = this.movingProject();
            const select = this.projectSelect();
            if (moving && !wasMovingProject && select) {
                this.projectSelector()
                    ?.nativeElement.querySelector<HTMLElement>('[role="combobox"]')
                    ?.focus();
                select.show();
            }
            if (!moving && wasMovingProject) this.moreActionsButton()?.nativeElement.focus();
            wasMovingProject = moving;
        });

        let wasEditing = false;
        afterRenderEffect(() => {
            const editing = this.editing();
            const button = this.moreActionsButton();
            if (!editing && wasEditing) {
                const target =
                    this.restoreFocus === 'title'
                        ? this.titleButton()
                        : this.restoreFocus === 'pencil'
                          ? this.pencilButton()
                          : button;
                const destination = target?.nativeElement;
                (destination && getComputedStyle(destination).display !== 'none'
                    ? destination
                    : button?.nativeElement
                )?.focus();
            }
            wasEditing = editing;
        });
    }

    protected protectCardInteraction(event: Event): void {
        if (!this.draggable() || this.disabled() || this.editing() || this.movingProject()) {
            return;
        }
        const target = event.target;
        if (!(target instanceof Element) || target.closest('.task-drag-handle')) {
            return;
        }
        if (
            target.closest(
                'button, a, input, textarea, select, [role="button"], [role="combobox"], [contenteditable], p-treeselect, app-task-description',
            )
        ) {
            // This listener is on a child of cdkDrag, so interactive starts never reach its root listener.
            // Do not preventDefault: native focus, clicks, selection, and scrolling stay available.
            event.stopPropagation();
        }
    }

    protected startEdit(
        focus: 'title' | 'description' = 'title',
        restoreFocus: 'title' | 'pencil' | 'actions' = 'actions',
    ): void {
        if (this.disabled() || this.contentFeedback()?.pending || this.editing()) {
            return;
        }
        this.initialFocus.set(focus);
        this.restoreFocus = restoreFocus;
        this.contentEditBaseline.set(this.contentFeedback()?.attemptId ?? 0);
        this.editing.set(true);
    }

    protected cancelEdit(): void {
        if (!this.contentFeedback()?.pending) this.editing.set(false);
    }

    protected saveContent(content: TaskContent): void {
        if (this.disabled() || this.contentFeedback()?.pending || !this.editing()) {
            return;
        }
        if (
            content.title === this.task().title &&
            content.description === this.task().description
        ) {
            this.editing.set(false);
            return;
        }
        this.contentSaved.emit({ task: this.task(), ...content });
    }

    protected openSchedule(event: Event, field?: TaskDateField): void {
        if (this.disabled() || this.editing()) {
            return;
        }
        this.scheduleRequested.emit({
            taskId: this.task().id,
            event,
            anchor: event.currentTarget as HTMLElement,
            ...(field ? { field } : {}),
        });
    }

    protected openActions(event: Event): void {
        if (!this.disabled()) this.actionsMenu()?.toggle(event);
    }

    protected openActionsWithKeyboard(event: Event): void {
        event.preventDefault();
        if (!this.disabled()) this.actionsMenu()?.show(event);
    }

    protected onProjectChange(project: TreeNode | null): void {
        if (this.disabled() || this.editing()) {
            return;
        }
        this.projectChange.emit({
            task: this.task(),
            projectId: project?.key ?? null,
        });
        if (this.movingProject()) {
            this.projectSelect()?.hide();
            this.finishProjectMove();
        }
    }

    protected finishProjectMove(): void {
        this.movingProject.set(false);
    }
}

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
import { RouterLink } from '@angular/router';
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
import { TreeSelect, TreeSelectModule } from 'primeng/treeselect';
import type { TreeNode } from 'primeng/api';
import {
    parseLocalDate,
} from '@/shared/utils/date.util';
import type { TaskDateField, TaskScheduleRequest } from '@/features/tasks/models/task-schedule.model';
import { CdkDrag, } from '@angular/cdk/drag-drop';
import { TaskContentEditorComponent } from '../task-content-editor/task-content-editor.component';
import { TaskDescriptionComponent } from '@/features/tasks/components/task-description/task-description.component';
import type { TaskContentChange, TaskContentFeedback, TaskContent } from '@/features/tasks/models/task-content.model';

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
    disabled = input<boolean>(false);
    readonly contentFeedback = input<TaskContentFeedback | null>(null);
    private readonly pencilButton = viewChild<ElementRef<HTMLButtonElement>>('pencilButton');
    private readonly titleButton = viewChild<ElementRef<HTMLButtonElement>>('titleButton');
    private readonly moreActionsButton = viewChild<ElementRef<HTMLButtonElement>>('moreActionsButton');
    private readonly contentEditBaseline = signal(0);
    protected readonly contentError = computed(() => {
        const result = this.contentFeedback();
        return result && result.attemptId > this.contentEditBaseline() ? result.error : null;
    });

    private readonly projectSelect = viewChild<TreeSelect>('projectSelect');
    private readonly projectSelector = viewChild<ElementRef<HTMLElement>>('projectSelector');
    protected readonly movingProject = signal(false);
    protected readonly projectName = computed(() => {
        const id = this.task().project_id;
        if (!id) return 'Inbox';
        return this.project()?.id === id ? this.project()!.name : this.selectedProjectNode()?.label ?? 'Project unavailable';
    });

    protected finishProjectMove(): void {
        this.movingProject.set(false);
    }

    protected readonly actionsMenu = viewChild<Menu>('actionsMenu');
    protected readonly menuItems = computed<MenuItem[]>(() => [
        { label: 'Edit task', icon: 'pi pi-pencil',
          disabled: this.disabled() || !!this.contentFeedback()?.pending || this.editing(),
          command: () => this.startEdit('title') },
        { label: 'Move to project', icon: 'pi pi-folder',
          disabled: this.disabled() || this.editing(),
          command: () => {
              if (!this.disabled() && !this.editing()) this.movingProject.set(true);
          } },
        { label: 'Delete task', icon: 'pi pi-trash',
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
            if (editingOwner !== null && editingOwner !== owner) {
                this.editing.set(false);
                this.projectSelect()?.hide();
                this.movingProject.set(false);
            }
            editingOwner = owner;
            const result = this.contentFeedback();
            if (this.editing() && result && result.attemptId > this.contentEditBaseline() &&
                !result.pending && !result.error) this.editing.set(false);
        });
        let wasMovingProject = false;
        afterRenderEffect(() => {
            const moving = this.movingProject();
            const select = this.projectSelect();
            if (moving && !wasMovingProject && select) {
                this.projectSelector()?.nativeElement.querySelector<HTMLElement>('[role="combobox"]')?.focus();
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
                const target = this.restoreFocus === 'title' ? this.titleButton()
                    : this.restoreFocus === 'pencil' ? this.pencilButton() : button;
                const destination = target?.nativeElement;
                (destination && getComputedStyle(destination).display !== 'none' ? destination : button?.nativeElement)?.focus();
            }
            wasEditing = editing;
        });

    }

    @Output() toggleDone = new EventEmitter<Task>();
    @Output() remove = new EventEmitter<string>();

    protected readonly editing = signal(false);
    protected readonly initialFocus = signal<'title' | 'description'>('title');
    private restoreFocus: 'title' | 'pencil' | 'actions' = 'actions';
    readonly task = input.required<Task>(); // The current task
    readonly project = input<Project | null>(null); // The project that the current task belongs to (if any)
    readonly projects = input<ProjectNode[]>([]); // The list of all *possible* projects (for the project dropdown)

    protected readonly calendarClock = inject(CalendarClockService);

    // Keep CDK's movement threshold. A short touch hold lets an ordinary swipe scroll first.
    protected readonly dragStartDelay = { mouse: 0, touch: 200 };

    protected protectCardInteraction(event: Event): void {
        if (!this.draggable() || this.disabled() || this.editing() || this.movingProject()) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('.task-drag-handle')) return;
        if (target.closest('button, a, input, textarea, select, [role="button"], [role="combobox"], [contenteditable], p-treeselect, app-task-description')) {
            // This listener is on a child of cdkDrag, so interactive starts never reach its root listener.
            // Do not preventDefault: native focus, clicks, selection, and scrolling stay available.
            event.stopPropagation();
        }
    }

    readonly draggable = input(false);
    readonly scheduleRequested = output<TaskScheduleRequest>();

    protected openSchedule(event: Event, field?: TaskDateField): void {
        if (this.disabled() || this.editing()) return;
        this.scheduleRequested.emit({ taskId: this.task().id, event, anchor: event.currentTarget as HTMLElement, ...(field ? { field } : {}) });
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
        if (this.movingProject()) {
            this.projectSelect()?.hide();
            this.finishProjectMove();
        }
    }

    protected startEdit(focus: 'title' | 'description' = 'title', restoreFocus: 'title' | 'pencil' | 'actions' = 'actions'): void {
        if (this.disabled() || this.contentFeedback()?.pending || this.editing()) return;
        this.initialFocus.set(focus);
        this.restoreFocus = restoreFocus;
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

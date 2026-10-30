import { Component, effect, inject, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { ButtonModule } from 'primeng/button';
import { TreeSelectModule } from 'primeng/treeselect';
import type { ProjectNode } from '@/features/projects/models/project.model';
import { TreeNode } from 'primeng/api';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { noWhitespaceValidator } from '@/shared/validators/no-whitespace-validator';
import {
    toProjectTreeNodes,
    findTreeNodeByKey,
} from '@/features/projects/utils/project-tree-node.util';
import { DatePickerModule } from 'primeng/datepicker';
import {
    parseLocalDate,
    formatLocalDate,
} from '@/shared/utils/date.util';

export type CreateTaskPayload = {
    title: string;
    description: string | null;
    projectId: string | null;
    plannedDate: string | null;
};

@Component({
    standalone: true,
    imports: [
        CommonModule,
        CardModule,
        InputTextModule,
        TextareaModule,
        // SelectModule,
        TreeSelectModule,
        DatePickerModule,
        ButtonModule,
        ReactiveFormsModule,
    ],
    selector: 'app-task-create',
    templateUrl: './task-create.component.html',
    styleUrls: ['./task-create.component.scss'],
})
export class TaskCreateComponent {
    readonly projects = input<ProjectNode[]>([]);

    readonly defaultProjectId = input<string | null>(null);
    readonly defaultPlannedDate = input<string | null>(null);

    private readonly fb = inject(NonNullableFormBuilder);

    protected readonly form = this.fb.group({
        title: ['', [Validators.required, noWhitespaceValidator]],
        description: [''],
        project: this.fb.control<TreeNode | null>(null),
        plannedDate: this.fb.control<Date | null>(null),
    });

    protected readonly projectOptions = computed<TreeNode[]>(() =>
        toProjectTreeNodes(this.projects()),
    );

    private readonly defaultProjectNode = computed(() => {
        const projectId = this.defaultProjectId();

        return projectId ? findTreeNodeByKey(this.projectOptions(), projectId) : null;
    });

    private readonly syncDefaultPlannedDate = effect(() => {
        const plannedDate = this.defaultPlannedDate();

        this.form.controls.plannedDate.setValue(parseLocalDate(plannedDate), { emitEvent: false });
    });

    private lastDefaultProjectId: string | null = null;
    private defaultApplied = false;

    private readonly syncDefaultProject = effect(() => {
        const projectId = this.defaultProjectId();
        const selectedNode = this.defaultProjectNode();

        if (projectId !== this.lastDefaultProjectId) {
            this.lastDefaultProjectId = projectId;
            this.defaultApplied = false;

            this.form.controls.project.setValue(null, {
                emitEvent: false,
            });
        }

        if (!this.defaultApplied && (!projectId || selectedNode)) {
            this.form.controls.project.setValue(selectedNode, {
                emitEvent: false,
            });

            this.defaultApplied = true;
        }
    });

    readonly disabled = input(false);

    readonly create = output<CreateTaskPayload>();
    readonly cancel = output<void>();

    protected onSubmit(): void {
        if (this.form.invalid || this.disabled()) {
            return;
        }

        const { title, description, project, plannedDate } = this.form.getRawValue();

        this.create.emit({
            title: title.trim(),
            description: description.trim() || null,
            projectId: project?.key ?? null,
            plannedDate: formatLocalDate(plannedDate),
        });

        // Do not reset here.
        // The parent decides whether creation succeeded.
    }

    protected onCancelCreateTask(): void {
        if (this.disabled()) {
            return;
        }

        this.cancel.emit();
    }
}

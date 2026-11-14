import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import type { TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TreeSelectModule } from 'primeng/treeselect';

import type { ProjectNode } from '@/features/projects/models/project.model';
import {
    findTreeNodeByKey,
    toProjectTreeNodes,
} from '@/features/projects/utils/project-tree-node.util';
import { formatLocalDate, parseLocalDate } from '@/shared/utils/date.util';
import { noWhitespaceValidator } from '@/shared/validators/no-whitespace-validator';

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
    private readonly fb = inject(NonNullableFormBuilder);

    readonly projects = input<ProjectNode[]>([]);
    readonly defaultProjectId = input<string | null>(null);
    readonly defaultPlannedDate = input<string | null>(null);
    readonly disabled = input(false);

    readonly create = output<CreateTaskPayload>();
    readonly cancel = output<void>();

    protected readonly form = this.fb.group({
        title: ['', [Validators.required, noWhitespaceValidator]],
        description: [''],
        project: this.fb.control<TreeNode | null>(null),
        plannedDate: this.fb.control<Date | null>(null),
    });

    private lastDefaultProjectId: string | null = null;
    private defaultApplied = false;

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

    protected onSubmit(): void {
        if (this.form.invalid || this.disabled()) {
            return;
        }

        const { title, description, project, plannedDate } = this.form.getRawValue();

        this.create.emit({
            title: title.trim(),
            description: description.trim() ? description : null,
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

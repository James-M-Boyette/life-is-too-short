import { Component, effect, inject, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { ButtonModule } from 'primeng/button';
import { TreeSelectModule } from 'primeng/treeselect';
import type { ProjectNode } from '@/features/projects/models/project.model';
import { TreeNode } from 'primeng/api';
import {
    ReactiveFormsModule,
    Validators,
    NonNullableFormBuilder,
} from '@angular/forms';
import { noWhitespaceValidator } from '@/shared/validators/no-whitespace-validator';
import {
    toProjectTreeNodes,
    findTreeNodeByKey,
} from '@/features/projects/utils/project-tree-node.util';

export type CreateTaskPayload = {
    title: string;
    description: string | null;
    projectId: string | null; // placeholder for later
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

    private readonly fb = inject(NonNullableFormBuilder);

    protected readonly form = this.fb.group({
        title: ['', [Validators.required, noWhitespaceValidator]],
        description: [''],
        project: this.fb.control<TreeNode | null>(null),
    });

    protected readonly projectOptions = computed<TreeNode[]>(() =>
        toProjectTreeNodes(this.projects())
    );

    private readonly defaultProjectNode = computed(() => {
        const projectId = this.defaultProjectId();

        return projectId
            ? findTreeNodeByKey(this.projectOptions(), projectId)
            : null;
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

    // Keep this as string for now so it plugs into TasksStore.add(title).
    // Later we'll upgrade this to emit { title, description, projectId }.
    readonly create = output<CreateTaskPayload>();

    protected onSubmit() {
        if ( this.form.invalid ) return;

        const { title, description, project } = this.form.getRawValue();

        this.create.emit({
            title: title.trim(),
            description: description.trim() || null,
            projectId: project?.key ?? null,
        });

        this.form.reset({
            title: '',
            description: '',
            project: project,
        });
    }

    protected onCancelCreateTask() {
        this.form.reset();
    }
}

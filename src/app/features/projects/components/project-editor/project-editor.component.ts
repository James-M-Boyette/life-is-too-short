import { Component, computed, effect, inject, input, output } from '@angular/core';
import {
    NonNullableFormBuilder,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';

import { TreeSelectModule } from 'primeng/treeselect';
import type { TreeNode } from 'primeng/api';

import type { Project, ProjectNode } from '@/features/projects/models/project.model';
import { findTreeNodeByKey, toProjectTreeNodes } from '@/features/projects/utils/project-tree-node.util';
import { noWhitespaceValidator } from '@/shared/validators/no-whitespace-validator';

export type CreateProjectPayload = {
    name: string;
    parentProjectId: string | null;
};

@Component({
    selector: 'app-project-editor',
    standalone: true,
    imports: [ReactiveFormsModule, TreeSelectModule],
    templateUrl: './project-editor.component.html',
    styleUrl: './project-editor.component.scss',
})
export class ProjectEditorComponent {
    readonly projects = input<ProjectNode[]>([]);
    readonly project = input<Project | null>(null);
    protected readonly isEditing = computed(() => this.project() !== null);
    readonly disabled = input(false);

    // readonly create = output<CreateProjectPayload>();
    readonly save = output<CreateProjectPayload>();
    readonly cancel = output<void>();

    private readonly fb = inject(NonNullableFormBuilder);

    protected readonly form = this.fb.group({
        name: ['', [Validators.required, noWhitespaceValidator]],
        parentProject: this.fb.control<TreeNode | null>(null),
    });


    protected readonly projectOptions = computed(() => {
        const editingId = this.project()?.id;

        const excludeBranch = (nodes: ProjectNode[]): ProjectNode[] =>
            nodes
                .filter(node => node.project.id !== editingId)
                .map(node => ({
                    ...node,
                    children: excludeBranch(node.children),
                }));

        return toProjectTreeNodes(excludeBranch(this.projects()));
    });

    constructor() {
        effect(() => {
            const project = this.project();
            const options = this.projectOptions();

            const selectedParent = project?.parent_project_id
                ? findTreeNodeByKey(options, project.parent_project_id)
                : null;

            this.form.reset({
                name: project?.name ?? '',
                parentProject: selectedParent,
            });
        });

        effect(() => {
            if (this.disabled()) {
                this.form.disable({ emitEvent: false });
            } else {
                this.form.enable({ emitEvent: false });
            }
        });
    }

    protected onSubmit(): void {
        if (this.disabled() || this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const { name, parentProject } = this.form.getRawValue();

        this.save.emit({
            name: name.trim(),
            parentProjectId: parentProject?.key ?? null,
        });
    }
}

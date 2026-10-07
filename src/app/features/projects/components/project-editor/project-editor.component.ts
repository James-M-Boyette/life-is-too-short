import { Component, computed, inject, input, output } from '@angular/core';
import {
    NonNullableFormBuilder,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';

import { TreeSelectModule } from 'primeng/treeselect';
import type { TreeNode } from 'primeng/api';

import type { ProjectNode } from '@/features/projects/models/project.model';
import { toProjectTreeNodes } from '@/features/projects/utils/project-tree-node.util';
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

    readonly create = output<CreateProjectPayload>();
    readonly cancel = output<void>();

    private readonly fb = inject(NonNullableFormBuilder);

    protected readonly form = this.fb.group({
        name: ['', [Validators.required, noWhitespaceValidator]],
        parentProject: this.fb.control<TreeNode | null>(null),
    });

    protected readonly projectOptions = computed(() =>
        toProjectTreeNodes(this.projects()),
    );

    protected onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const { name, parentProject } = this.form.getRawValue();

        this.create.emit({
            name: name.trim(),
            parentProjectId: parentProject?.key ?? null,
        });
    }
}

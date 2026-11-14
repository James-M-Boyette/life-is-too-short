import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import type { TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TreeSelectModule } from 'primeng/treeselect';

import type { Project, ProjectNode } from '@/features/projects/models/project.model';
import {
    findTreeNodeByKey,
    toProjectTreeNodes,
} from '@/features/projects/utils/project-tree-node.util';
import { noWhitespaceValidator } from '@/shared/validators/no-whitespace-validator';

export type CreateProjectPayload = {
    name: string;
    parentProjectId: string | null;
};

@Component({
    selector: 'app-project-editor',
    standalone: true,
    imports: [ReactiveFormsModule, TreeSelectModule, ButtonModule],
    templateUrl: './project-editor.component.html',
    styleUrl: './project-editor.component.scss',
})
export class ProjectEditorComponent {
    private readonly fb = inject(NonNullableFormBuilder);

    readonly projects = input<ProjectNode[]>([]);
    readonly project = input<Project | null>(null);
    readonly disabled = input(false);

    readonly save = output<CreateProjectPayload>();
    readonly cancel = output<void>();

    protected readonly form = this.fb.group({
        name: ['', [Validators.required, noWhitespaceValidator]],
        parentProject: this.fb.control<TreeNode | null>(null),
    });

    // A new component instance is a fresh dialog session; identity changes can
    // also initialize a reused editor. Same-project snapshots never reset drafts.
    private editingId: string | null | undefined;

    protected readonly isEditing = computed(() => this.project() !== null);

    protected readonly projectOptions = computed(() => {
        const editingId = this.project()?.id;

        const excludeBranch = (nodes: ProjectNode[]): ProjectNode[] =>
            nodes
                .filter((node) => node.project.id !== editingId)
                .map((node) => ({
                    ...node,
                    children: excludeBranch(node.children),
                }));

        return toProjectTreeNodes(excludeBranch(this.projects()));
    });

    constructor() {
        const parentControl = this.form.controls.parentProject;
        parentControl.addValidators((control) => {
            const selected = control.value as TreeNode | null;
            return selected &&
                (!selected.key || !findTreeNodeByKey(this.projectOptions(), selected.key))
                ? { unavailableParent: true }
                : null;
        });

        effect(() => {
            const project = this.project();
            const id = project?.id ?? null;
            if (id === this.editingId) {
                return;
            }

            this.editingId = id;

            // Initial values are a session snapshot, not an options dependency.
            untracked(() => {
                const parentId = project?.parent_project_id;
                this.form.reset({
                    name: project?.name ?? '',
                    parentProject: parentId
                        ? (findTreeNodeByKey(this.projectOptions(), parentId) ?? {
                              key: parentId,
                              label: 'Unavailable project',
                          })
                        : null,
                });
            });
        });

        effect(() => {
            const options = this.projectOptions();
            const selected = parentControl.value;
            const refreshed = selected?.key ? findTreeNodeByKey(options, selected.key) : null;
            if (refreshed && refreshed !== selected) {
                // Rebind TreeSelect's node object by identity without resetting
                // the name, parent intent, or dirty/touched state.
                parentControl.setValue(refreshed, { emitEvent: false });
            }
            // Retain unavailable choices visibly, but block submission until the
            // user clears/replaces them or they become available again.
            parentControl.updateValueAndValidity({ emitEvent: false });
        });

        effect(() => {
            const disabled = this.disabled();
            // Validators read options; that must not make enable/disable track them.
            untracked(() => {
                if (disabled) this.form.disable({ emitEvent: false });
                else this.form.enable({ emitEvent: false });
            });
        });
    }

    protected onSubmit(): void {
        // Validate current options even when submission precedes the sync effect.
        this.form.controls.parentProject.updateValueAndValidity({ emitEvent: false });
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

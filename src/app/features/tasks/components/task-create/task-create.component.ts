import { Component, EventEmitter, inject, computed, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
// import { EditorModule } from 'primeng/editor'; // Needs `pnpm install quill`
import { ButtonModule } from 'primeng/button';
import { TreeSelectModule } from 'primeng/treeselect';
import type { ProjectNode } from '@/features/projects/models/project.model';
import { TreeNode } from 'primeng/api';
import {
    ReactiveFormsModule,
    FormGroup,
    FormControl,
    Validators,
    NonNullableFormBuilder,
} from '@angular/forms';
import { noWhitespaceValidator } from '@/shared/validators/no-whitespace-validator';

// type ProjectOption = {
//     label: string;
//     items: Array<{ label: string; value: string }>;
// };

export type CreateTaskPayload = {
    title: string;
    notes: string | null;
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
    // readonly disabled = input<boolean>(false);
    readonly projects = input<ProjectNode[]>([]);

    private readonly fb = inject(NonNullableFormBuilder);

    protected readonly form = this.fb.group({
        title: ['', [Validators.required, noWhitespaceValidator]],
        notes: [''],
        project: this.fb.control<TreeNode | null>(null),
    });

    protected readonly projectOptions = computed<TreeNode[]>(() =>
        this.toTreeNodes(this.projects()),
    );

    // constructor() {
        // Diagnostic Logging:
        // this.form.controls.project.valueChanges.subscribe((value) => {
        //     console.log('🌲 project changed:', value);

        //     if (value) {
        //         console.log('🌲 selected project key:', value.key);
        //     } else {
        //         console.log('🌲 project was cleared/reset');
        //     }
        // });
    // }

    private toTreeNodes(nodes: ProjectNode[]): TreeNode[] {
        return nodes.map((node) => {
            const hasChildren = node.children.length > 0;

            return {
                key: node.project.id,
                label: node.project.name,
                leaf: !hasChildren,
                children: hasChildren ? this.toTreeNodes(node.children) : undefined,
            };
        });
    }

    // Keep this as string for now so it plugs into TasksStore.add(title).
    // Later we'll upgrade this to emit { title, notes, projectId }.
    readonly create = output<CreateTaskPayload>();

    protected onSubmit() {
        // Diagnostic Logging:
        // console.log('🔎 form value:', this.form.getRawValue());
        // console.log('🔎 form valid:', this.form.valid);
        // console.log('🔎 form errors:', this.form.errors);
        // console.log('🔎 title:', this.form.controls.title);
        // console.log('🔎 project:', this.form.controls.project);

        if ( this.form.invalid ) return;

        const { title, notes, project } = this.form.getRawValue();

        // console.log('🔎 project form value:', project);

        this.create.emit({
            title: title.trim(),
            notes: notes.trim() || null,
            projectId: project?.key ?? null,
        });

        this.form.reset();
    }

    protected onCancelCreateTask() {
        // console.log(`❌ Canceling and Clearing the new Task form`);
        // console.log('🚨🚨🚨 NEW CODE IS RUNNING 🚨🚨🚨');
        this.form.reset();
    }

    // Diagnostic Logging:
    // protected onProjectSelect(event: unknown) {
    //     console.log('🌲 TreeSelect event:', event);
    //     console.log('🌲 project control value:', this.form.controls.project.value);
    // }
}

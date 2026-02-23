import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
// import { EditorModule } from 'primeng/editor'; // Needs `pnpm install quill`
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
// import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';

type ProjectOption = {
    label: string;
    items: Array<{ label: string; value: string }>;
};

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
        SelectModule,
        ButtonModule,
        // ReactiveFormsModule,
    ],
    selector: 'app-task-create',
    templateUrl: './task-create.component.html',
    styleUrls: ['./task-create.component.scss'],
})
export class TaskCreateComponent {
    @Input() disabled = false;

    // Keep this as string for now so it plugs into TasksStore.add(title).
    // Later we'll upgrade this to emit { title, notes, projectId }.
    @Output() create = new EventEmitter<CreateTaskPayload>();

    // --- UI state (signals) ---
    protected readonly titleDraft = signal('');
    protected readonly notesDraft = signal('');

    // project is placeholder for now
    protected readonly selectedProject = signal<string | null>(null);
    protected readonly groupedProjects = signal<ProjectOption[]>([]);

    protected readonly canSubmit = computed(
        () => this.titleDraft().trim().length > 0 && !this.disabled,
    );

    protected onTitleInput(event: Event) {
        const el = event.target as HTMLInputElement;
        this.titleDraft.set(el.value);
    }

    protected onNotesInput(event: Event) {
        const el = event.target as HTMLTextAreaElement;
        this.notesDraft.set(el.value);
    }

    // We’re not wiring project behavior yet, but this is ready when you want it.
    protected onProjectChange(value: string | null) {
        this.selectedProject.set(value);
    }

    protected onSubmit(event: SubmitEvent) {
        event.preventDefault();

        const title = this.titleDraft().trim();
        if (!title || this.disabled) return;

        const notes = this.notesDraft().trim();
        this.create.emit({
            title,
            notes: notes.length ? notes : null,
            projectId: this.selectedProject(),
        });

        // Clear the form
        this.titleDraft.set('');
        this.notesDraft.set('');
        this.selectedProject.set(null);
    }

    protected onCancelCreateTask() {
        console.log(`❌ Canceling and Clearing the new Task form`);
        this.titleDraft.set('');
        this.notesDraft.set('');
        this.selectedProject.set(null);
    }
}

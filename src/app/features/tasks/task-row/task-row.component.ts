import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import type { Task } from '@/features/tasks/tasks.store';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        CheckboxModule,
        ButtonModule,
    ],
    selector: 'app-task-row',
    templateUrl: './task-row.component.html',
    styleUrls: ['./task-row.component.scss'],
})
export class TaskRowComponent {
    @Input({ required: true }) task!: Task;
    @Input() disabled = false;

    @Output() toggleDone = new EventEmitter<Task>();
    @Output() remove = new EventEmitter<string>();
    @Output() rename = new EventEmitter<{ task: Task; title: string }>();

    protected readonly isCompleted = signal(false);
    protected readonly editing = signal(false);
    protected readonly draftTitle = signal('');

    protected startEdit() {
        if (this.disabled) return;
        this.draftTitle.set(this.task.title);
        this.editing.set(true);
    }

    protected cancelEdit() {
        this.editing.set(false);
    }

    protected commitEdit() {
        const title = this.draftTitle().trim();
        this.editing.set(false);

        if (!title || title === this.task.title) return;
        this.rename.emit({ task: this.task, title });
    }

     protected onToggleCompleted(event: Event) {
        const el = event.target as HTMLInputElement;
        this.isCompleted.set(el.checked);
    }

    protected onDraftInput(event: Event) {
        const input = event.target as HTMLInputElement;
        this.draftTitle.set(input.value);
    }

    protected onSubmit(event: SubmitEvent) {
        event.preventDefault();
        this.commitEdit();
    }

    @Output() editNotes = new EventEmitter<{ task: Task; notes: string | null }>();

    protected readonly notesOpen = signal(false);
    protected readonly editingNotes = signal(false);
    protected readonly draftNotes = signal('');

    protected toggleNotesOpen() {
        this.notesOpen.update((v) => !v);
        if (!this.notesOpen()) this.editingNotes.set(false);
    }

    protected startNotesEdit() {
        if (this.disabled) return;
        this.draftNotes.set(this.task.notes ?? '');
        this.editingNotes.set(true);
        this.notesOpen.set(true);
    }

    protected cancelNotesEdit() {
        this.editingNotes.set(false);
    }

    protected commitNotesEdit() {
        const value = this.draftNotes();
        this.editingNotes.set(false);
        this.editNotes.emit({ task: this.task, notes: value });
    }

    protected onNotesInput(event: Event) {
        const el = event.target as HTMLTextAreaElement;
        this.draftNotes.set(el.value);
    }

    protected onNotesSubmit(event: SubmitEvent) {
        event.preventDefault();
        this.commitNotesEdit();
    }
}

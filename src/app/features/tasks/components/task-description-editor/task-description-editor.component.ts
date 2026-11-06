import { Component, ElementRef, afterNextRender, input, output, signal, viewChild, OnInit } from '@angular/core';
import { PopoverModule, Popover } from 'primeng/popover';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-task-description-editor',
    standalone: true,
    imports: [PopoverModule, TooltipModule],
    templateUrl: './task-description-editor.component.html',
    styleUrl: './task-description-editor.component.scss',
})
export class TaskDescriptionEditorComponent implements OnInit {
    readonly source = input.required<string>();
    readonly formId = input.required<string>();
    readonly disabled = input(false);
    readonly pending = input(false);
    readonly error = input<string | null>(null);
    readonly saved = output<string | null>();
    readonly cancelled = output<void>();
    protected readonly draft = signal('');
    private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
    private readonly helpButton = viewChild<ElementRef<HTMLButtonElement>>('helpButton');
    protected readonly help = viewChild<Popover>('help');

    constructor() {
        afterNextRender(() => this.textarea()?.nativeElement.focus());
    }

    ngOnInit(): void {
        // Capture once per editing session; optimistic task updates must not overwrite a draft.
        this.draft.set(this.source());
    }

    protected onInput(event: Event): void {
        this.draft.set((event.target as HTMLTextAreaElement).value);
    }

    protected submit(event: Event): void {
        event.preventDefault();
        if (!this.disabled() && !this.pending()) {
            const source = this.draft();
            this.saved.emit(source.trim() ? source : null);
        }
    }

    protected escape(event: Event): void {
        event.stopPropagation();
        if (this.help()?.overlayVisible) this.closeHelp();
        else if (!this.pending()) this.cancelled.emit();
    }

    protected closeHelp(): void {
        this.help()?.hide();
        this.helpButton()?.nativeElement.focus();
    }
}

import {
    Component,
    ElementRef,
    afterNextRender,
    computed,
    input,
    output,
    signal,
    viewChild,
    OnInit,
} from '@angular/core';
import { PopoverModule, Popover } from 'primeng/popover';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import type { TaskContent } from '../../models/task-content.model';

@Component({
    selector: 'app-task-content-editor',
    standalone: true,
    imports: [PopoverModule, TooltipModule, ButtonModule],
    templateUrl: './task-content-editor.component.html',
    styleUrl: './task-content-editor.component.scss',
})
export class TaskContentEditorComponent implements OnInit {
    readonly content = input.required<TaskContent>();
    readonly taskId = input.required<string>();
    readonly initialFocus = input<'title' | 'description'>('title');
    readonly disabled = input(false);
    readonly pending = input(false);
    readonly error = input<string | null>(null);
    readonly saved = output<TaskContent>();
    readonly cancelled = output<void>();
    protected readonly draftTitle = signal('');
    protected readonly draftDescription = signal('');
    protected readonly titleInvalid = computed(() => !this.draftTitle().trim());
    protected readonly attempted = signal(false);
    private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
    private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
    private readonly helpButton = viewChild<ElementRef<HTMLButtonElement>>('helpButton');
    protected readonly help = viewChild<Popover>('help');

    constructor() {
        afterNextRender(() => {
            if (this.initialFocus() === 'description') this.textarea()?.nativeElement.focus();
            else this.titleInput()?.nativeElement.focus();
        });
    }

    ngOnInit(): void {
        // One snapshot per editing session. Optimistic updates must not replace drafts.
        this.draftTitle.set(this.content().title);
        this.draftDescription.set(this.content().description ?? '');
    }

    protected inputValue(event: Event): string {
        return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    }

    protected submit(event: Event): void {
        event.preventDefault();
        if (this.disabled() || this.pending()) return;
        this.attempted.set(true);
        if (this.titleInvalid()) {
            this.titleInput()?.nativeElement.focus();
            return;
        }
        const source = this.draftDescription();
        this.saved.emit({
            title: this.draftTitle().trim(),
            description: source.trim() ? source : null,
        });
    }

    protected cancel(): void {
        if (!this.pending()) this.cancelled.emit();
    }

    protected escape(event: Event): void {
        event.stopPropagation();
        if (this.help()?.overlayVisible) this.closeHelp();
        else this.cancel();
    }

    protected closeHelp(): void {
        this.help()?.hide();
        this.helpButton()?.nativeElement.focus();
    }
}

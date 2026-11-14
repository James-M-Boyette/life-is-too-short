import { Component, ViewEncapsulation, computed, input, output, signal } from '@angular/core';

import { TooltipModule } from 'primeng/tooltip';

import { taskMarkdown } from '@/features/tasks/utils/task-markdown.util';

@Component({
    selector: 'app-task-description',
    standalone: true,
    imports: [TooltipModule],
    templateUrl: './task-description.component.html',
    styleUrl: './task-description.component.scss',
    // Prefix every rule with the component selector so generated Markdown HTML is styled too.
    encapsulation: ViewEncapsulation.None,
})
export class TaskDescriptionComponent {
    readonly source = input.required<string>();
    readonly taskId = input.required<string>();
    readonly editable = input(false);

    readonly editRequested = output<void>();

    private readonly expandedSource = signal<string | null>(null);

    protected readonly content = computed(() => taskMarkdown(this.source()));
    protected readonly expanded = computed(() => this.expandedSource() === this.source());

    protected requestEdit(event: MouseEvent): void {
        const target = event.target;
        if (
            !this.editable() ||
            !(target instanceof Element) ||
            target.closest('a, button, input, textarea, select, [role="button"]') ||
            !window.getSelection()?.isCollapsed
        ) {
            return;
        }

        this.editRequested.emit();
    }

    protected toggle(): void {
        this.expandedSource.set(this.expanded() ? null : this.source());
    }
}

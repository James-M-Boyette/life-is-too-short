import { Component, ViewEncapsulation, computed, input, signal } from '@angular/core';
import { taskMarkdown } from '@/features/tasks/utils/task-markdown.util';

@Component({
    selector: 'app-task-description',
    standalone: true,
    templateUrl: './task-description.component.html',
    styleUrl: './task-description.component.scss',
    // Prefix every rule with the component selector so generated Markdown HTML is styled too.
    encapsulation: ViewEncapsulation.None,
})
export class TaskDescriptionComponent {
    readonly source = input.required<string>();
    readonly taskId = input.required<string>();
    protected readonly content = computed(() => taskMarkdown(this.source()));
    private readonly expandedSource = signal<string | null>(null);
    protected readonly expanded = computed(() => this.expandedSource() === this.source());

    protected toggle(): void {
        this.expandedSource.set(this.expanded() ? null : this.source());
    }
}

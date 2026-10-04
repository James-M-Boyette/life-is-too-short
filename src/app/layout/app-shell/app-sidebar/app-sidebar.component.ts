import { Component, computed, input, output } from '@angular/core';

import { TreeModule } from 'primeng/tree';

import type { ProjectNode } from '@/features/projects/models/project.model';
import { toProjectTreeNodes } from '@/features/projects/utils/project-tree-node.util';

@Component({
    selector: 'app-app-sidebar',
    standalone: true,
    imports: [TreeModule],
    templateUrl: './app-sidebar.component.html',
    styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
    readonly projects = input<ProjectNode[]>([]);

    readonly projectSelect = output<string | null>();

    protected readonly projectOptions = computed(() => toProjectTreeNodes(this.projects()));
}

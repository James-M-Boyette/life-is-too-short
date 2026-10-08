import { Component, signal, computed, effect, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TreeModule } from 'primeng/tree';
// import type { TreeNode } from 'primeng/api';

import type { ProjectNode } from '@/features/projects/models/project.model';
import { toProjectTreeNodes } from '@/features/projects/utils/project-tree-node.util';
import type { TreeNode } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [
        RouterLink,
        RouterLinkActive,
        TreeModule,
        TooltipModule
    ],
    templateUrl: './app-sidebar.component.html',
    styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
    readonly projects = input<ProjectNode[]>([]);

    // protected readonly projectNodes = computed(() => toProjectTreeNodes(this.projects()));

    protected readonly expandedProjectIds = signal<Set<string>>(new Set());

    protected readonly projectNodes = computed(() =>
        toProjectTreeNodes(this.projects(), this.expandedProjectIds()),
    );

    readonly createProject = output<void>();
    readonly editProject = output<string>();

    protected collapseAll(): void {
        this.expandedProjectIds.set(new Set());
    }

    protected expandAll(): void {
        this.expandedProjectIds.set(this.collectExpandableProjectIds(this.projects()));
    }

    private collectExpandableProjectIds(nodes: ProjectNode[]): Set<string> {
        const ids = new Set<string>();

        for (const node of nodes) {
            if (node.children.length > 0) {
                ids.add(node.project.id);

                const childIds = this.collectExpandableProjectIds(node.children);

                for (const id of childIds) {
                    ids.add(id);
                }
            }
        }

        return ids;
    }

    protected onNodeExpand(event: { node: TreeNode }): void {
        const projectId = event.node.key;

        if (!projectId) {
            return;
        }

        this.expandedProjectIds.update((ids) => {
            const next = new Set(ids);
            next.add(projectId);

            return next;
        });
    }

    protected onNodeCollapse(event: { node: TreeNode }): void {
        const projectId = event.node.key;

        if (!projectId) {
            return;
        }

        this.expandedProjectIds.update((ids) => {
            const next = new Set(ids);
            next.delete(projectId);

            return next;
        });
    }

    readonly expandProjectRequest = input<{
        projectId: string;
    } | null>(null);

    constructor() {
        effect(() => {
            const request = this.expandProjectRequest();

            if (!request) return;

            this.expandedProjectIds.update(ids => {
                const next = new Set(ids);
                next.add(request.projectId);
                return next;
            });
        });
    }
}

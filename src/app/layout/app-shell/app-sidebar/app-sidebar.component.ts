import { Component, signal, computed, effect, input, output, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TreeModule } from 'primeng/tree';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

import type { ProjectNode } from '@/features/projects/models/project.model';
import { toProjectTreeNodes } from '@/features/projects/utils/project-tree-node.util';
import type { TreeNode } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [RouterLink, RouterLinkActive, TreeModule, TooltipModule],
    templateUrl: './app-sidebar.component.html',
    styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
    readonly projects = input<ProjectNode[]>([]);

    private readonly router = inject(Router);
    private readonly navigationUrl = toSignal(
        this.router.events.pipe(
            filter((event): event is NavigationEnd => event instanceof NavigationEnd),
            map(event => event.urlAfterRedirects),
        ),
        { initialValue: this.router.url },
    );
    private readonly activeProjectId = computed(() => {
        const segments = this.router.parseUrl(this.navigationUrl()).root.children['primary']?.segments;
        return segments?.length === 3 && segments[0].path === 'tasks' && segments[1].path === 'project'
            ? segments[2].path
            : null;
    });
    // Stable paths avoid reopening a manually collapsed branch on unrelated data updates.
    private readonly activeAncestorPath = computed(() => {
        const find = (nodes: ProjectNode[]): string[] | null => {
            for (const node of nodes) {
                if (node.project.id === this.activeProjectId()) return [];
                const descendants = find(node.children);
                if (descendants) return [node.project.id, ...descendants];
            }
            return null;
        };
        return find(this.projects()) ?? [];
    }, {
        equal: (previous, next) => previous.length === next.length &&
            previous.every((id, index) => id === next[index]),
    });

    protected readonly expandedProjectIds = signal<Set<string>>(new Set());

    protected readonly projectNodes = computed(() =>
        toProjectTreeNodes(this.projects(), this.expandedProjectIds()),
    );

    readonly navigated = output<void>();
    readonly createTask = output<void>();

    readonly createProject = output<void>();

    protected onProjectControlKeydown(event: KeyboardEvent): void {
        // Let native links/buttons activate once; retain the tree's arrow and Tab handling.
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    }

    protected onNavigationClick(event: MouseEvent): void {
        event.stopPropagation();
        if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            this.navigated.emit();
        }
    }

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

    protected toggleProjectChildren(node: TreeNode): void {
        if (!node.key || !node.children?.length) return;
        if (this.expandedProjectIds().has(node.key)) this.onNodeCollapse({ node });
        else this.onNodeExpand({ node });
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
            this.activeProjectId();
            const ancestors = this.activeAncestorPath();
            if (!ancestors.length) return;
            this.expandedProjectIds.update(ids => new Set([...ids, ...ancestors]));
        });
        effect(() => {
            const request = this.expandProjectRequest();

            if (!request) return;

            this.expandedProjectIds.update((ids) => {
                const next = new Set(ids);
                next.add(request.projectId);
                return next;
            });
        });
    }
}

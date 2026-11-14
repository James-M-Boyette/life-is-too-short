import {
    Component,
    signal,
    computed,
    effect,
    input,
    output,
    inject,
    viewChild,
    DestroyRef,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TreeModule } from 'primeng/tree';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

import type { ProjectNode } from '@/features/projects/models/project.model';
import { toProjectTreeNodes } from '@/features/projects/utils/project-tree-node.util';
import { DOCUMENT } from '@angular/common';
import { Menu, MenuModule } from 'primeng/menu';
import type { MenuItem } from 'primeng/api';
import type { TreeNode } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [RouterLink, RouterLinkActive, TreeModule, TooltipModule, MenuModule],
    templateUrl: './app-sidebar.component.html',
    styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
    readonly projects = input<ProjectNode[]>([]);

    private readonly router = inject(Router);
    private readonly navigationUrl = toSignal(
        this.router.events.pipe(
            filter((event): event is NavigationEnd => event instanceof NavigationEnd),
            map((event) => event.urlAfterRedirects),
        ),
        { initialValue: this.router.url },
    );
    private readonly activeProjectId = computed(() => {
        const segments = this.router.parseUrl(this.navigationUrl()).root.children['primary']
            ?.segments;
        return segments?.length === 3 &&
            segments[0].path === 'tasks' &&
            segments[1].path === 'project'
            ? segments[2].path
            : null;
    });
    // Stable paths avoid reopening a manually collapsed branch on unrelated data updates.
    private readonly activeAncestorPath = computed(
        () => {
            const find = (nodes: ProjectNode[]): string[] | null => {
                for (const node of nodes) {
                    if (node.project.id === this.activeProjectId()) return [];
                    const descendants = find(node.children);
                    if (descendants) return [node.project.id, ...descendants];
                }
                return null;
            };
            return find(this.projects()) ?? [];
        },
        {
            equal: (previous, next) =>
                previous.length === next.length &&
                previous.every((id, index) => id === next[index]),
        },
    );

    protected readonly expandedProjectIds = signal<Set<string>>(new Set());

    protected readonly projectNodes = computed(() =>
        toProjectTreeNodes(this.projects(), this.expandedProjectIds()),
    );

    readonly navigated = output<void>();
    readonly createTask = output<void>();

    readonly createProject = output<void>();

    readonly editProject = output<string>();
    readonly deleteProject = output<string>();
    readonly available = input(true);
    readonly mobile = input(false);
    protected readonly selectedProjectId = signal<string | null>(null);
    protected readonly overlayParent = signal<HTMLElement | 'body'>('body');
    protected readonly menuOpen = signal(false);
    private readonly menu = viewChild<Menu>('projectMenu');
    private readonly document = inject(DOCUMENT);
    private trigger: HTMLButtonElement | null = null;
    private restoreOnHide = true;
    private pendingMenu: { id: string; trigger: HTMLButtonElement } | null = null;
    private menuElement: HTMLElement | null = null;
    private readonly stopMenuEscape = (event: KeyboardEvent) => {
        // Consume Escape before the surrounding modal drawer handles the same key.
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.preventDefault();
        this.dismissMenu();
        if (this.trigger?.isConnected && this.available())
            this.trigger.focus({ preventScroll: true });
    };
    protected readonly menuItems: MenuItem[] = [
        {
            label: 'Edit project',
            icon: 'pi pi-pencil',
            command: () => this.requestProjectAction('edit'),
        },
        {
            label: 'Delete project',
            icon: 'pi pi-trash',
            command: () => this.requestProjectAction('delete'),
            style: {
                '--p-menu-item-color': 'var(--color-status-danger)',
                '--p-menu-item-icon-color': 'var(--color-status-danger)',
                '--p-menu-item-focus-color': 'var(--color-status-danger-hover)',
                '--p-menu-item-icon-focus-color': 'var(--color-status-danger-hover)',
                '--p-menu-item-focus-background': 'var(--color-status-danger-soft)',
            },
        },
    ];

    private projectExists(id: string, nodes = this.projects()): boolean {
        return nodes.some(
            (node) => node.project.id === id || this.projectExists(id, node.children),
        );
    }

    protected openProjectMenu(event: MouseEvent, id: string): void {
        event.stopPropagation();
        if (!this.available() || !this.projectExists(id)) return;
        const trigger = event.currentTarget as HTMLButtonElement;
        if (this.menuOpen()) {
            this.pendingMenu = this.selectedProjectId() === id ? null : { id, trigger };
            this.restoreOnHide = false;
            this.menu()?.hide();
            return;
        }
        this.showProjectMenu(id, trigger);
    }

    private showProjectMenu(id: string, trigger: HTMLButtonElement): void {
        if (!this.available() || !this.projectExists(id) || !trigger.isConnected) return;
        this.trigger = trigger;
        this.restoreOnHide = true;
        this.selectedProjectId.set(id);
        this.overlayParent.set(this.trigger.closest<HTMLElement>('.p-drawer') ?? 'body');
        this.menuOpen.set(true);
        this.menu()?.show({ currentTarget: trigger });
    }

    protected menuShown(): void {
        this.menuElement?.removeEventListener('keydown', this.stopMenuEscape, true);
        this.menuElement = this.menu()?.container ?? null;
        this.menuElement?.addEventListener('keydown', this.stopMenuEscape, true);
    }

    protected menuHidden(): void {
        const focused = this.document.activeElement;
        if (
            this.restoreOnHide &&
            (focused === this.document.body || this.menuElement?.contains(focused))
        ) {
            if (this.trigger?.isConnected && !this.trigger.closest('[hidden], [inert]'))
                this.trigger.focus({ preventScroll: true });
        }
        this.menuElement?.removeEventListener('keydown', this.stopMenuEscape, true);
        this.menuElement = null;
        this.menuOpen.set(false);
        this.selectedProjectId.set(null);
        const pending = this.pendingMenu;
        this.pendingMenu = null;
        if (pending) this.showProjectMenu(pending.id, pending.trigger);
    }

    private dismissMenu(restore = true): void {
        this.pendingMenu = null;
        this.restoreOnHide = restore;
        this.menu()?.hide();
    }

    private requestProjectAction(action: 'edit' | 'delete'): void {
        const id = this.selectedProjectId();
        this.dismissMenu(false);
        if (!id || !this.available() || !this.projectExists(id)) return;
        if (action === 'edit') this.editProject.emit(id);
        else this.deleteProject.emit(id);
    }

    protected onProjectControlKeydown(event: KeyboardEvent): void {
        // Let native links/buttons activate once; retain the tree's arrow and Tab handling.
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    }

    protected onNavigationClick(event: MouseEvent): void {
        event.stopPropagation();
        if (
            event.button === 0 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey
        ) {
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
        inject(DestroyRef).onDestroy(() =>
            this.menuElement?.removeEventListener('keydown', this.stopMenuEscape, true),
        );
        let previousMobile = this.mobile();
        effect(() => {
            const mobile = this.mobile();
            const id = this.selectedProjectId();
            if (!this.available() || mobile !== previousMobile || (id && !this.projectExists(id)))
                this.dismissMenu(false);
            previousMobile = mobile;
        });
        effect(() => {
            this.activeProjectId();
            const ancestors = this.activeAncestorPath();
            if (!ancestors.length) return;
            this.expandedProjectIds.update((ids) => new Set([...ids, ...ancestors]));
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

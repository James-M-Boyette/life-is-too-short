import { ProjectDialogService, type ProjectDialogRequest } from '@/features/projects/services/project-dialog.service';
import { MOBILE_LAYOUT_QUERY } from '@/shared/utils/mobile-layout';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CdkPortalOutlet, DomPortal } from '@angular/cdk/portal';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DrawerModule, Drawer } from 'primeng/drawer';
import { AccountControlsComponent } from './account-controls/account-controls.component';
import { Component, computed, effect, inject, signal, afterNextRender, ElementRef, Injector, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd, NavigationStart } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { AuthStore } from '@/shared/supabase/auth.store';
import { TopBarComponent } from '@/layout/app-shell/top-bar/top-bar.component';
import { AppSidebarComponent } from '@/layout/app-shell/app-sidebar/app-sidebar.component';
import { ProjectsStore } from '@/features/projects/state/projects.store';

import { DialogModule } from 'primeng/dialog';
import {
    CreateProjectPayload,
    ProjectEditorComponent,
} from '@/features/projects/components/project-editor/project-editor.component';
import type { Project } from '@/features/projects/models/project.model';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import {
    TaskCreateComponent,
    type CreateTaskPayload,
} from '@/features/tasks/components/task-create/task-create.component';
import type { TaskCreateContext } from '@/features/tasks/models/task-create-context.model';
import { TaskCreateDialogService } from '@/features/tasks/services/task-create-dialog.service';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';

@Component({
    standalone: true,
    selector: 'app-shell',
    imports: [
        CommonModule, DrawerModule, CdkPortalOutlet, AccountControlsComponent,
        RouterOutlet, RouterLink, RouterLinkActive, TooltipModule,
        ButtonModule,
        TopBarComponent,
        AppSidebarComponent,
        DialogModule,
        ProjectEditorComponent,
        TaskCreateComponent,
    ],
    providers: [TaskCreateDialogService, ProjectDialogService],
    templateUrl: './app-shell.component.html',
    styleUrls: ['./app-shell.component.scss'],
})
export class AppShellComponent {
    protected readonly auth = inject(AuthStore);
    private readonly router = inject(Router);
    private readonly projectDialogs = inject(ProjectDialogService);
    private readonly pageProjectDialog = signal<ProjectDialogRequest | null>(null);
    private dialogOwner = this.auth.userId();
    private dialogGeneration = 0;

    private ownsDialogSession(owner: string | null, generation: number): boolean {
        return owner !== null && owner === this.auth.userId() &&
            owner === this.dialogOwner && generation === this.dialogGeneration;
    }

    private synchronizeDialogSession(): void {
        const owner = this.auth.userId();
        if (owner === this.dialogOwner) return;
        this.dialogOwner = owner;
        this.dialogGeneration++;
        // Force-close account-owned drafts without restoring obsolete focus.
        this.taskCreateDialog.close();
        this.taskCreateError.set(null);
        this.creatingTask.set(false);
        this.dismissPageProjectDialog();
        this.createProjectError.set(null);
        this.deleteProjectError.set(null);
        this.expandProjectRequest.set(null);
        this.navigationOpen.set(false);
    }

    private restoreProjectActionFocus(): void {
        const context = this.pageProjectDialog();
        const owner = this.dialogOwner;
        const generation = this.dialogGeneration;
        this.pageProjectDialog.set(null);
        if (context?.trigger.isConnected && context.userId === this.auth.userId() && !context.trigger.closest('[hidden], [inert]')) {
            afterNextRender(() => {
                if (this.ownsDialogSession(owner, generation) && context.trigger.isConnected && !context.trigger.closest('[hidden], [inert]')) context.trigger.focus({ preventScroll: true });
            }, { injector: this.injector });
        } else this.restoreMobileActionFocus();
    }

    private dismissPageProjectDialog(): void {
        this.creatingProject.set(false);
        this.deletingProject.set(false);
        this.createProjectDialogVisible.set(false);
        this.projectToDelete.set(null);
        this.editingProject.set(null);
        this.pageProjectDialog.set(null);
    }

    private readonly injector = inject(Injector);
    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly breakpoints = inject(BreakpointObserver);
    // One sidebar instance is relocated by CDK, retaining its signal-based expansion state.
    private readonly sidebarElement = viewChild.required<ElementRef<HTMLElement>>('sidebarContent');
    private readonly accountMenu = viewChild(AccountControlsComponent);
    private readonly navigationDrawer = viewChild<Drawer>('navigationDrawer');
    protected readonly sidebarPortal = signal<DomPortal | null>(null);
    protected readonly mobile = signal(this.breakpoints.isMatched(MOBILE_LAYOUT_QUERY));
    protected readonly navigationOpen = signal(false);
    protected readonly desktopCollapsed = signal(false);
    protected readonly desktopHidden = computed(() => !this.mobile() && this.desktopCollapsed());
    protected readonly shellColumns = computed(() => this.mobile() ? 'minmax(0, 1fr)'
        : this.desktopCollapsed() ? '4rem minmax(0, 1fr)' : this.sidebarWidth() + 'px 6px minmax(0, 1fr)');
    protected readonly railDestinations = [
        { label: 'Inbox', route: '/tasks/inbox', icon: 'pi pi-inbox' },
        { label: 'Today', route: '/tasks/today', icon: 'pi pi-calendar' },
        { label: 'Upcoming', route: '/tasks/upcoming', icon: 'pi pi-calendar-plus' },
    ] as const;

    protected setDesktopCollapsed(collapsed: boolean): void {
        if (this.mobile()) return;
        this.accountMenu()?.dismiss(false);
        this.isResizingSidebar.set(false);
        this.desktopCollapsed.set(collapsed);
        afterNextRender(() => {
            if (!this.mobile()) this.element.nativeElement.querySelector<HTMLElement>(collapsed ? '.expand-navigation' : '.collapse-navigation')?.focus();
        }, { injector: this.injector });
    }
    protected readonly drawerStyle = { background: 'var(--surface-sidebar)', width: 'min(80vw, 20rem)', height: '100dvh', maxHeight: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' };

    protected openNavigation(): void { if (this.mobile()) this.navigationOpen.set(true); }
    protected closeNavigation(): void {
        if (!this.navigationOpen()) return;
        this.accountMenu()?.dismiss(false);
        this.navigationOpen.set(false);
        const owner = this.dialogOwner;
        const generation = this.dialogGeneration;
        afterNextRender(() => {
            if (this.ownsDialogSession(owner, generation)) this.restoreNavigationFocus();
        }, { injector: this.injector });
    }
    protected navigationShown(): void {
        this.navigationDrawer()?.container?.querySelector<HTMLElement>('[aria-label="Close navigation"]')?.focus();
    }
    private restoreNavigationFocus(): void {
        // Do not steal focus from a task/project dialog opened from the drawer.
        if (this.taskDialogVisible() || this.createProjectDialogVisible() || this.projectToDelete()) return;
        const target = this.mobile()
            ? this.element.nativeElement.querySelector<HTMLElement>('[aria-label="Show navigation"]')
            : this.desktopCollapsed()
                ? this.element.nativeElement.querySelector<HTMLElement>('.expand-navigation')
                : this.sidebarElement().nativeElement.querySelector<HTMLElement>('a.active, a');
        target?.focus();
    }

    private restoreMobileActionFocus(label = 'Show navigation'): void {
        if (!this.mobile()) return;
        const owner = this.dialogOwner;
        const generation = this.dialogGeneration;
        afterNextRender(() => {
            if (this.ownsDialogSession(owner, generation) && this.mobile()) this.element.nativeElement.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.focus();
        }, { injector: this.injector });
    }

    protected readonly signingOut = signal(false);
    private readonly signOutFailure = signal<{ owner: string | undefined; message: string } | null>(null);
    protected readonly signOutError = computed(() => {
        const failure = this.signOutFailure();
        return failure?.owner === this.auth.user()?.id ? failure?.message ?? null : null;
    });

    protected readonly projectsStore = inject(ProjectsStore);
    protected readonly tasksStore = inject(TasksStore);

    private readonly taskCreateDialog = inject(TaskCreateDialogService);
    protected readonly taskDialogVisible = computed(() => this.taskCreateDialog.context() !== null);
    protected readonly taskCreateContext = this.taskCreateDialog.context;
    protected readonly creatingTask = signal(false);
    protected readonly taskCreateError = signal<string | null>(null);
    private readonly calendarClock = inject(CalendarClockService);

    private getCurrentTaskContext(): TaskCreateContext {
        const path = this.router.url.split('?')[0];

        if (path === '/tasks/today') {
            return {
                projectId: null,
                plannedDate: this.calendarClock.today(),
            };
        }

        if (path.startsWith('/tasks/project/')) {
            const projectId = path.split('/')[3];

            if (projectId && this.projectsStore.getProject(projectId)?.user_id === this.auth.userId()) {
                return {
                    projectId,
                    plannedDate: null,
                };
            }
        }

        return {
            projectId: null,
            plannedDate: null,
        };
    }

    protected openTaskDialog(): void {
        this.synchronizeDialogSession();
        if (!this.auth.userId()) return;
        this.closeNavigation();
        if (this.taskDialogVisible() || this.creatingTask()) {
            return;
        }

        this.taskCreateError.set(null);
        this.taskCreateDialog.open(this.getCurrentTaskContext());
    }

    protected closeTaskDialog(): void {
        if (this.creatingTask() || !this.taskDialogVisible()) return;

        this.taskCreateDialog.close();
        this.taskCreateError.set(null);
        this.restoreMobileActionFocus('Add task');
    }

    private closeTaskDialogAfterSave(): void {
        this.taskCreateDialog.close();
        this.taskCreateError.set(null);
        this.restoreMobileActionFocus('Add task');
    }

    protected async createTask(payload: CreateTaskPayload): Promise<void> {
        const owner = this.dialogOwner;
        const generation = this.dialogGeneration;
        const context = this.taskCreateDialog.context();
        const ownsInteraction = () => this.ownsDialogSession(owner, generation) && context === this.taskCreateDialog.context();
        if (!context || this.creatingTask() || !ownsInteraction()) return;

        this.creatingTask.set(true);
        this.taskCreateError.set(null);

        try {
            await this.tasksStore.addTask(payload);
            if (!ownsInteraction()) return;
            this.creatingTask.set(false);
            this.closeTaskDialogAfterSave();
        } catch (error: unknown) {
            if (!ownsInteraction()) return;
            this.taskCreateError.set(
                error instanceof Error ? error.message : 'Could not create task. Please try again.',
            );
        } finally {
            if (ownsInteraction()) this.creatingTask.set(false);
        }
    }

    protected readonly createProjectDialogVisible = signal(false);
    protected readonly creatingProject = signal(false);
    protected readonly createProjectError = signal<string | null>(null);

    protected readonly editingProject = signal<Project | null>(null);

    protected readonly projectDialogTitle = computed(() =>
        this.editingProject() ? 'Edit Project' : 'Create Project',
    );

    protected readonly projectToDelete = signal<Project | null>(null);
    protected readonly deletingProject = signal(false);
    protected readonly deleteProjectError = signal<string | null>(null);

    protected readonly directChildCount = computed(() => {
        const project = this.projectToDelete();

        if (!project) return 0;

        return this.projectsStore
            .projects()
            .filter((child) => child.parent_project_id === project.id).length;
    });

    protected readonly directTaskCount = computed(() => {
        const project = this.projectToDelete();

        if (!project) return 0;

        return this.tasksStore.tasks().filter((task) => task.project_id === project.id).length;
    });

    constructor() {
        effect(() => this.synchronizeDialogSession());
        this.projectDialogs.requests.pipe(takeUntilDestroyed()).subscribe(request => {
            const project = this.projectsStore.getProject(request.projectId);
            if (!project || project.user_id !== request.userId || this.auth.userId() !== request.userId || this.router.url !== request.sourceUrl ||
                this.createProjectDialogVisible() || this.projectToDelete() || this.creatingProject() || this.deletingProject()) return;
            if (request.action === 'edit') this.openEditProjectDialog(request.projectId);
            else this.openDeleteProjectDialog(request.projectId);
            this.pageProjectDialog.set(request);
        });
        effect(() => {
            const userId = this.auth.userId();
            const context = this.pageProjectDialog();
            if (context && (context.userId !== userId || (!this.deletingProject() && !this.projectsStore.getProject(context.projectId)))) this.dismissPageProjectDialog();
        });
        afterNextRender(() => this.sidebarPortal.set(new DomPortal(this.sidebarElement())));
        this.breakpoints.observe(MOBILE_LAYOUT_QUERY).pipe(takeUntilDestroyed()).subscribe(result => {
            const changed = this.mobile() !== result.matches;
            const drawerWasOpen = this.navigationOpen();
            const focused = this.element.nativeElement.ownerDocument.activeElement;
            const navigationHadFocus = !!focused?.closest('.desktop-navigation, .app-sidebar, #account-menu-panel, app-top-bar');
            this.mobile.set(result.matches);
            this.closeNavigation();
            this.isResizingSidebar.set(false);
            if (changed && navigationHadFocus && !drawerWasOpen) {
                afterNextRender(() => this.restoreNavigationFocus(), { injector: this.injector });
            }
        });
        this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
            if (event instanceof NavigationStart && this.pageProjectDialog()) this.dismissPageProjectDialog();
            if (event instanceof NavigationEnd) this.closeNavigation();
        });
        // Keep shell protected even if someone deep-links into /tasks
        effect(() => {
            if (!this.auth.isAuthed()) void this.router.navigateByUrl('/login');
        });
    }

    protected openCreateProjectDialog(): void {
        this.synchronizeDialogSession();
        if (!this.auth.userId() || this.creatingProject() || this.deletingProject()) return;
        this.closeNavigation();
        this.pageProjectDialog.set(null);
        this.editingProject.set(null);
        this.createProjectError.set(null);
        this.createProjectDialogVisible.set(true);
    }

    protected openEditProjectDialog(projectId: string): void {
        this.synchronizeDialogSession();
        if (!this.auth.userId() || this.creatingProject() || this.deletingProject()) return;
        this.pageProjectDialog.set(null);
        this.closeNavigation();
        const project = this.projectsStore.getProject(projectId);

        if (!project || project.user_id !== this.auth.userId()) {
            return;
        }

        this.editingProject.set(project);
        this.createProjectError.set(null);
        this.createProjectDialogVisible.set(true);
    }

    protected readonly expandProjectRequest = signal<{
        projectId: string;
    } | null>(null);

    protected async onSaveProject(payload: CreateProjectPayload): Promise<void> {
        if (this.creatingProject()) {
            return;
        }

        const owner = this.dialogOwner;
        const generation = this.dialogGeneration;
        const context = this.pageProjectDialog();
        const ownsInteraction = () => this.ownsDialogSession(owner, generation) && context === this.pageProjectDialog();
        if (!this.createProjectDialogVisible() || !ownsInteraction()) return;
        if (context && (context.userId !== owner || context.sourceUrl !== this.router.url || !this.projectsStore.getProject(context.projectId))) return;
        this.creatingProject.set(true);
        this.createProjectError.set(null);

        try {
            const project = this.editingProject();

            const savedProject = project
                ? await this.projectsStore.updateProject({
                      projectId: project.id,
                      ...payload,
                  })
                : await this.projectsStore.createProject(payload);

            if (!ownsInteraction()) return;
            if (savedProject.parent_project_id) {
                this.expandProjectRequest.set({
                    projectId: savedProject.parent_project_id,
                });
            }

            this.creatingProject.set(false);
            this.closeCreateProjectDialog();
        } catch (error: unknown) {
            if (!ownsInteraction()) return;
            this.createProjectError.set(
                error instanceof Error ? error.message : 'Failed to save project',
            );
        } finally {
            if (ownsInteraction()) this.creatingProject.set(false);
        }
    }

    protected closeCreateProjectDialog(): void {
        if (!this.createProjectDialogVisible()) return;
        this.createProjectDialogVisible.set(false);
        this.restoreProjectActionFocus();
    }

    protected openDeleteProjectDialog(projectId: string): void {
        this.synchronizeDialogSession();
        if (!this.auth.userId() || this.creatingProject() || this.deletingProject()) return;
        this.pageProjectDialog.set(null);
        this.closeNavigation();
        const project = this.projectsStore.getProject(projectId);

        if (!project || project.user_id !== this.auth.userId()) return;

        this.projectToDelete.set(project);
        this.deleteProjectError.set(null);
    }

    protected closeDeleteProjectDialog(): void {
        if (this.deletingProject() || !this.projectToDelete()) return;
        this.projectToDelete.set(null);
        this.deleteProjectError.set(null);
        this.restoreProjectActionFocus();
    }

    protected async confirmDeleteProject(): Promise<void> {
        const project = this.projectToDelete();

        if (!project || this.deletingProject()) return;

        const owner = this.dialogOwner;
        const generation = this.dialogGeneration;
        const context = this.pageProjectDialog();
        const ownsSession = () => this.ownsDialogSession(owner, generation);
        const ownsInteraction = () => ownsSession() && context === this.pageProjectDialog();
        if (!ownsInteraction() || project.user_id !== owner) return;
        if (context && (context.userId !== owner || context.sourceUrl !== this.router.url || !this.projectsStore.getProject(context.projectId))) return;
        this.deletingProject.set(true);
        this.deleteProjectError.set(null);

        try {
            // Only this operation determines whether deletion succeeded.
            await this.projectsStore.deleteProject(project.id);
        } catch (error: unknown) {
            if (!ownsInteraction()) return;
            this.deleteProjectError.set(
                error instanceof Error ? error.message : 'Failed to delete project',
            );

            this.deletingProject.set(false);
            return;
        }

        if (ownsInteraction()) this.deletingProject.set(false);
        if (!ownsSession()) return;

        // Dialog cleanup belongs only to the still-current interaction.
        if (ownsInteraction()) {
            this.projectToDelete.set(null);
            this.restoreProjectActionFocus();
        }

        // Successful persistence still needs reconciliation after same-account navigation.
        // refreshTasks retains its existing session protections for an account change in flight.
        try {
            await this.tasksStore.refreshTasks();
        } catch {
            // TasksStore owns current-session refresh errors. A stale rejection
            // must not escape this UI event handler or revive the deleted dialog.
        }
        if (!ownsSession()) return;

        // Navigate away if the deleted project was being viewed.
        if (this.router.url.split('?')[0] === `/tasks/project/${project.id}`) {
            await this.router.navigateByUrl('/tasks/inbox');
        }
    }

    protected async signOut() {
        if (this.signingOut()) return;
        const owner = this.auth.user()?.id;
        this.signingOut.set(true);
        this.signOutFailure.set(null);
        try {
            await this.auth.signOut();
            this.accountMenu()?.dismiss(false);
            this.closeNavigation();
            await this.router.navigateByUrl('/login');
        } catch {
            if (this.auth.user()?.id === owner) this.signOutFailure.set({ owner, message: 'Could not log out. Please try again.' });
        } finally {
            this.signingOut.set(false);
        }
    }

    private readonly defaultSidebarWidth = 260;
    readonly minSidebarWidth = 200;
    readonly maxSidebarWidth = 480;

    protected readonly sidebarWidth = signal(this.defaultSidebarWidth);
    protected readonly isResizingSidebar = signal(false);

    private resizeStartX = 0;
    private resizeStartWidth = 0;

    protected startSidebarResize(event: PointerEvent): void {
        if (this.mobile() || this.desktopCollapsed()) return;
        // Only respond to the primary mouse button.
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        event.preventDefault();

        this.resizeStartX = event.clientX;
        this.resizeStartWidth = this.sidebarWidth();

        this.isResizingSidebar.set(true);

        // Keep receiving pointer events even when the pointer
        // moves outside the resize handle.
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    protected resizeSidebar(event: PointerEvent): void {
        if (!this.isResizingSidebar()) {
            return;
        }

        const deltaX = event.clientX - this.resizeStartX;
        const newWidth = this.resizeStartWidth + deltaX;

        this.sidebarWidth.set(
            Math.max(this.minSidebarWidth, Math.min(this.maxSidebarWidth, newWidth)),
        );
    }

    protected stopSidebarResize(event: PointerEvent): void {
        if (!this.isResizingSidebar()) {
            return;
        }

        this.isResizingSidebar.set(false);

        const element = event.currentTarget as HTMLElement;

        if (element.hasPointerCapture(event.pointerId)) {
            element.releasePointerCapture(event.pointerId);
        }
    }

    protected resetSidebarWidth(): void {
        this.sidebarWidth.set(this.defaultSidebarWidth);
    }

    protected onSidebarResizeKeydown(event: KeyboardEvent): void {
        if (this.mobile() || this.desktopCollapsed()) return;
        const step = event.shiftKey ? 40 : 10;

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                this.sidebarWidth.update((width) => Math.max(this.minSidebarWidth, width - step));
                break;

            case 'ArrowRight':
                event.preventDefault();
                this.sidebarWidth.update((width) => Math.min(this.maxSidebarWidth, width + step));
                break;

            case 'Home':
                event.preventDefault();
                this.sidebarWidth.set(this.minSidebarWidth);
                break;

            case 'End':
                event.preventDefault();
                this.sidebarWidth.set(this.maxSidebarWidth);
                break;
        }
    }
}

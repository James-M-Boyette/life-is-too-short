import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@/shared/supabase/auth.store';
import { TopBarComponent } from '@/layout/app-shell/top-bar/top-bar.component';
import { AppSidebarComponent } from '@/layout/app-shell/app-sidebar/app-sidebar.component';
import { ProjectsStore } from '@/features/projects/state/projects.store';

import { DialogModule } from 'primeng/dialog';
import { CreateProjectPayload, ProjectEditorComponent } from '@/features/projects/components/project-editor/project-editor.component';
import type { Project } from '@/features/projects/models/project.model';
import { TasksStore } from '@/features/tasks/state/tasks.store';

@Component({
    standalone: true,
    selector: 'app-shell',
    imports: [
        CommonModule,
        RouterOutlet,
        ButtonModule,
        TopBarComponent,
        AppSidebarComponent,
        DialogModule,
        ProjectEditorComponent
    ],
    templateUrl: './app-shell.component.html',
    styleUrls: ['./app-shell.component.scss'],
})
export class AppShellComponent {
    protected readonly auth = inject(AuthStore);
    private readonly router = inject(Router);

    protected readonly userEmail = computed(() => this.auth.user()?.email ?? null);

    protected readonly projectsStore = inject(ProjectsStore);
    protected readonly tasksStore = inject(TasksStore);

    protected readonly createProjectDialogVisible = signal(false);
    protected readonly creatingProject = signal(false);
    protected readonly createProjectError = signal<string | null>(null);

    protected readonly editingProject = signal<Project | null>(null);

    protected readonly projectDialogTitle = computed(() =>
        this.editingProject() ? 'Edit Project' : 'Create Project'
    );

    protected readonly projectToDelete = signal<Project | null>(null);
    protected readonly deletingProject = signal(false);
    protected readonly deleteProjectError = signal<string | null>(null);

    protected readonly directChildCount = computed(() => {
        const project = this.projectToDelete();

        if (!project) return 0;

        return this.projectsStore.projects().filter(
            child => child.parent_project_id === project.id
        ).length;
    });

    protected readonly directTaskCount = computed(() => {
        const project = this.projectToDelete();

        if (!project) return 0;

        return this.tasksStore.tasks().filter(
            task => task.project_id === project.id
        ).length;
    });

    constructor() {
    // Keep shell protected even if someone deep-links into /tasks
        effect(() => {
            if (!this.auth.isAuthed()) void this.router.navigateByUrl('/login');
        });
    }

    protected openCreateProjectDialog(): void {
        this.editingProject.set(null);
        this.createProjectError.set(null);
        this.createProjectDialogVisible.set(true);
    }

    protected openEditProjectDialog(projectId: string): void {
        const project = this.projectsStore.getProject(projectId);

        if (!project) {
            return;
        }

        this.editingProject.set(project);
        this.createProjectError.set(null);
        this.createProjectDialogVisible.set(true);
    }

    protected readonly expandProjectRequest = signal<{
        projectId: string;
    } | null>(null);

    protected async onSaveProject(
        payload: CreateProjectPayload
    ): Promise<void> {
        if (this.creatingProject()) {
            return;
        }

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

            if (savedProject.parent_project_id) {
                this.expandProjectRequest.set({
                    projectId: savedProject.parent_project_id,
                });
            }

            this.closeCreateProjectDialog();
        } catch (error: unknown) {
            this.createProjectError.set(
                error instanceof Error
                    ? error.message
                    : 'Failed to save project'
            );
        } finally {
            this.creatingProject.set(false);
        }
    }

    protected closeCreateProjectDialog(): void {
        this.createProjectDialogVisible.set(false);
    }

    protected openDeleteProjectDialog(projectId: string): void {
        const project = this.projectsStore.getProject(projectId);

        if (!project) return;

        this.projectToDelete.set(project);
        this.deleteProjectError.set(null);
    }

    protected closeDeleteProjectDialog(): void {
        if (this.deletingProject()) return;

        this.projectToDelete.set(null);
        this.deleteProjectError.set(null);
    }

    protected async confirmDeleteProject(): Promise<void> {
        const project = this.projectToDelete();

        if (!project || this.deletingProject()) return;

        this.deletingProject.set(true);
        this.deleteProjectError.set(null);

        try {
            // Only this operation determines whether deletion succeeded.
            await this.projectsStore.deleteProject(project.id);
        } catch (error: unknown) {
            this.deleteProjectError.set(
                error instanceof Error
                    ? error.message
                    : 'Failed to delete project'
            );

            this.deletingProject.set(false);
            return;
        }

        // Deletion succeeded. Close the dialog.
        this.projectToDelete.set(null);
        this.deletingProject.set(false);

        // Reconcile task state with the database.
        await this.tasksStore.refreshTasks();

        // Navigate away if the deleted project was being viewed.
        if (this.router.url.split('?')[0] === `/tasks/project/${project.id}`) {
            await this.router.navigateByUrl('/tasks/inbox');
        }
    }

    protected async signOut() {
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
    }

    private readonly defaultSidebarWidth = 260;
    readonly minSidebarWidth = 200;
    readonly maxSidebarWidth = 480;

    protected readonly sidebarWidth = signal(this.defaultSidebarWidth);
    protected readonly isResizingSidebar = signal(false);

    private resizeStartX = 0;
    private resizeStartWidth = 0;

    protected startSidebarResize(event: PointerEvent): void {
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
            Math.max(
                this.minSidebarWidth,
                Math.min(this.maxSidebarWidth, newWidth)
            )
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
        const step = event.shiftKey ? 40 : 10;

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                this.sidebarWidth.update(width =>
                    Math.max(this.minSidebarWidth, width - step)
                );
                break;

            case 'ArrowRight':
                event.preventDefault();
                this.sidebarWidth.update(width =>
                    Math.min(this.maxSidebarWidth, width + step)
                );
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

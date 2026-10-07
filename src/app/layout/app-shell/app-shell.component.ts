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
    protected readonly editingProject = signal<Project | null>(null);

    protected readonly projectDialogTitle = computed(() =>
        this.editingProject() ? 'Edit Project' : 'Create Project'
    );

    protected readonly createProjectDialogVisible = signal(false);

    protected readonly creatingProject = signal(false);
    protected readonly createProjectError = signal<string | null>(null);

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

    protected async onCreateProject(
        payload: CreateProjectPayload
    ): Promise<void> {
        if (this.creatingProject()) {
            return;
        }

        this.creatingProject.set(true);
        this.createProjectError.set(null);

        try {
            await this.projectsStore.createProject(payload);

            this.closeCreateProjectDialog();
        } catch (error: unknown) {
            this.createProjectError.set(
                error instanceof Error
                    ? error.message
                    : 'Failed to create project'
            );
        } finally {
            this.creatingProject.set(false);
        }
    }

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

            if (project) {
                await this.projectsStore.updateProject({
                    projectId: project.id,
                    ...payload,
                });
            } else {
                await this.projectsStore.createProject(payload);
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

    protected async signOut() {
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
    }
}

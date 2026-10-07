import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@/shared/supabase/auth.store';
import { TopBarComponent } from '@/layout/app-shell/top-bar/top-bar.component';
import { AppSidebarComponent } from '@/layout/app-shell/app-sidebar/app-sidebar.component';
import { ProjectsStore } from '@/features/projects/state/projects.store';

import { DialogModule } from 'primeng/dialog';

@Component({
    standalone: true,
    selector: 'app-shell',
    imports: [
        CommonModule,
        RouterOutlet,
        ButtonModule,
        TopBarComponent,
        AppSidebarComponent,
        DialogModule
    ],
    templateUrl: './app-shell.component.html',
    styleUrls: ['./app-shell.component.scss'],
})
export class AppShellComponent {
    protected readonly auth = inject(AuthStore);
    private readonly router = inject(Router);

    protected readonly userEmail = computed(() => this.auth.user()?.email ?? null);

    protected readonly projectsStore = inject(ProjectsStore);

    protected readonly createProjectDialogVisible = signal(false);

    protected openCreateProjectDialog(): void {
        this.createProjectDialogVisible.set(true);
    }

    protected closeCreateProjectDialog(): void {
        this.createProjectDialogVisible.set(false);
    }

    constructor() {
        // Keep shell protected even if someone deep-links into /tasks
        effect(() => {
            if (!this.auth.isAuthed()) void this.router.navigateByUrl('/login');
        });
    }

    protected async signOut() {
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
    }
}

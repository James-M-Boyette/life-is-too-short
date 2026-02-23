import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@/shared/supabase/auth.store';

@Component({
    standalone: true,
    selector: 'app-shell',
    imports: [
        CommonModule,
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        ButtonModule
    ],
    templateUrl: './app-shell.component.html',
    styleUrls: ['./app-shell.component.scss'],
})
export class AppShellComponent {
    protected readonly auth = inject(AuthStore);
    private readonly router = inject(Router);

    protected readonly userEmail = computed(() => this.auth.user()?.email ?? null);

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

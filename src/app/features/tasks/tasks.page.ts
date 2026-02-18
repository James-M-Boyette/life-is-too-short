import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '@/shared/supabase/auth.store';
import { TasksStore } from './tasks.store';
import { Router } from '@angular/router';

@Component({
    standalone: true,
    imports: [CommonModule],
    templateUrl: './tasks.page.html',
    styleUrl: './tasks.page.scss',
})
export class TasksPage {
    protected readonly newTitle = signal('');
    protected readonly auth = inject(AuthStore);
    protected readonly tasksStore = inject(TasksStore);
    private readonly router = inject(Router);

    constructor() {}

    protected readonly canAdd = computed(() => this.newTitle().trim().length > 0);

    async add() {
        const title = this.newTitle().trim();
        if (!title) return;
        await this.tasksStore.add(title);
        this.newTitle.set('');
    }

    protected async onSubmit(event: SubmitEvent) {
        event.preventDefault(); // stops full page refresh
        await this.add();
    }

    protected onInput(event: Event) {
        const input = event.target as HTMLInputElement;
        this.newTitle.set(input.value);
    }

    protected async signOut() {
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
    }
}

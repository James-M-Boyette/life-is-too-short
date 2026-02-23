import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthStore } from '@/shared/supabase/auth.store';
import { TasksStore } from './tasks.store';
import { Router } from '@angular/router';
import { TaskCreateComponent, CreateTaskPayload } from '@/features/tasks/task-create/task-create.component';
import { TaskRowComponent } from '@/features/tasks/task-row/task-row.component';

@Component({
    standalone: true,
    imports: [
        CommonModule,
        TaskCreateComponent,
        TaskRowComponent
    ],
    templateUrl: './tasks.page.html',
    styleUrls: ['./tasks.page.scss'],
})
export class TasksPage {
    protected readonly auth = inject(AuthStore);
    protected readonly tasksStore = inject(TasksStore);
    private readonly router = inject(Router);

    // protected readonly newTitle = signal('');

    constructor() {}

    // protected readonly canAdd = computed(() => this.newTitle().trim().length > 0);

    // async add() {
    //     const title = this.newTitle().trim();
    //     if (!title) return;

    //     try {
    //         await this.tasksStore.add(title);
    //         this.newTitle.set('');
    //     } catch (e: any) {
    //         this.tasksStore.error.set(e?.message ?? 'Failed to add task');
    //     }
    // }

    protected async createTask(payload: CreateTaskPayload) {
        try {
            await this.tasksStore.add(payload);
        } catch (e: any) {
            console.log(`🚨 Error creating the task: ${e.message}`);
            // this.tasksStore.error.set(e?.message ?? 'Failed to add task');
        }
    }

    // protected async onSubmit(event: SubmitEvent) {
    //     event.preventDefault(); // stops full page refresh
    //     await this.add();
    // }

    // protected onInput(event: Event) {
    //     const input = event.target as HTMLInputElement;
    //     this.newTitle.set(input.value);
    // }

    protected async signOut() {
        await this.auth.signOut();
        await this.router.navigateByUrl('/login');
    }
}

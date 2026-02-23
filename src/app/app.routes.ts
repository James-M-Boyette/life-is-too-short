import { Routes } from '@angular/router';
import { authedOnlyGuard } from '@/shared/supabase/authed-only.guard';
import { LoginPage } from '@/features/auth/login.page';
import { TasksPage } from '@/features/tasks/pages/tasks.page';
import { AuthCallbackPage } from '@/features/auth/auth-callback.page';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'tasks' },
    { path: 'login', component: LoginPage },
    { path: 'auth/callback', component: AuthCallbackPage },
    { path: 'tasks', component: TasksPage, canMatch: [authedOnlyGuard] },
    { path: '**', redirectTo: 'tasks' },
];

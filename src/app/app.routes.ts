import { Routes } from '@angular/router';
import { authedOnlyGuard } from '@/shared/supabase/authed-only.guard';
import { LoginPage } from '@/features/auth/pages/login.page';
import { TasksPage } from '@/features/tasks/pages/tasks.page';
import { AuthCallbackPage } from '@/features/auth/pages/auth-callback.page';

// export const routes: Routes = [
//     { path: '', pathMatch: 'full', redirectTo: 'tasks' },
//     { path: 'login', component: LoginPage },
//     { path: 'auth/callback', component: AuthCallbackPage },
//     { path: 'tasks', component: TasksPage, canMatch: [authedOnlyGuard] },
//     { path: '**', redirectTo: 'tasks' },
// ];
export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('@/features/auth/pages/login.page').then((m) => m.LoginPage),
    },

    {
        path: '',
        loadComponent: () =>
            import('@/layout/app-shell/app-shell.component').then((m) => m.AppShellComponent),
        children: [
            {
                path: 'tasks',
                loadComponent: () =>
                    import('@/features/tasks/pages/tasks.page').then((m) => m.TasksPage),
            },
            { path: '', pathMatch: 'full', redirectTo: 'tasks' },
        ],
    },

    { path: '**', redirectTo: '' },
];

import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '@/shared/supabase/auth.store';

@Component({
    template: `<p role="status">Signing you in…</p>`,
})
export class AuthCallbackPage {
    private readonly router = inject(Router);
    private readonly auth = inject(AuthStore);

    constructor() {
        effect(() => {
            if (this.auth.initializing()) return;
            void this.router.navigateByUrl(this.auth.isAuthed() ? '/tasks' : '/login', {
                replaceUrl: true,
            });
        });
    }
}

import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { supabase } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';

@Component({
    template: `<p>Signing you in…</p>`,
})
export class AuthCallbackPage {
    private readonly router = inject(Router);
    private readonly auth = inject(AuthStore);

    constructor() {
        void this.finish();
    }

    private async finish() {
        // Supabase email confirmation links often include a `code` param.
        // This exchanges it for a session and persists it.
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);

        if (error) {
            // Fall back to login on any failure.
            await this.router.navigateByUrl('/login');
            return;
        }

        // AuthStore will also receive the session via onAuthStateChange,
        // but this makes navigation deterministic.
        await this.router.navigateByUrl(this.auth.isAuthed() ? '/tasks' : '/login');
    }
}

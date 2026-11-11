import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class AuthStore {
    private readonly auth = inject(SUPABASE_CLIENT).auth;
    private readonly pendingInitialSession = signal(true);
    readonly initializing = this.pendingInitialSession.asReadonly();
    readonly session = signal<Session | null>(null);

    readonly user = computed(() => this.session()?.user ?? null);
    readonly userId = computed(() => this.user()?.id ?? null);
    readonly isAuthed = computed(() => !!this.userId());

    constructor() {
        const { data: { subscription } } = this.auth.onAuthStateChange((event, session) => {
            // INITIAL_SESSION follows SDK restoration and URL handling. A
            // live event may already have provided a newer session decision.
            if (event === 'INITIAL_SESSION' && !this.initializing()) return;
            this.session.set(session);
            this.pendingInitialSession.set(false);
        });
        inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    }

    async signUp(email: string, password: string) {
        const emailRedirectTo = new URL('auth/callback', document.baseURI).toString();

        const { error } = await this.auth.signUp({
            email,
            password,
            options: { emailRedirectTo },
        });

        if (error) throw error;
    }

    async signIn(email: string, password: string) {
        const { error } = await this.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async signOut() {
        const { error } = await this.auth.signOut();
        if (error) throw error;
    }
}

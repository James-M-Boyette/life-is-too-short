import { Injectable, computed, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class AuthStore {
    readonly session = signal<Session | null>(null);

    readonly user = computed(() => this.session()?.user ?? null);
    readonly userId = computed(() => this.user()?.id ?? null);
    readonly isAuthed = computed(() => !!this.userId());

    constructor() {
        supabase.auth.getSession().then(({ data, error }) => {
            if (!error) this.session.set(data.session);
        });

        supabase.auth.onAuthStateChange((_event, session) => {
            this.session.set(session);
        });
    }

    async signUp(email: string, password: string) {
        const emailRedirectTo = new URL('auth/callback', document.baseURI).toString();

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo },
        });

        if (error) throw error;
    }

    async signIn(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
}

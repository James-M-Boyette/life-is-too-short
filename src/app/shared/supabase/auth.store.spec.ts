import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { vi } from 'vitest';

import { routes } from '@/app.routes';
import { AuthStore } from './auth.store';
import { SUPABASE_CLIENT } from './supabase.client';

@Component({ template: '' })
class Destination {}

const session = (id: string) => ({ user: { id } }) as Session;

describe('AuthStore initialization and callback', () => {
    let emit: (event: AuthChangeEvent, value: Session | null) => void;
    const unsubscribe = vi.fn();
    const auth = {
        onAuthStateChange: vi.fn((callback: typeof emit) => {
            emit = callback;
            return { data: { subscription: { unsubscribe } } };
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        signUp: vi.fn(),
        exchangeCodeForSession: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        const callback = routes.find(route => route.path === 'auth/callback')!;
        TestBed.configureTestingModule({
            providers: [
                { provide: SUPABASE_CLIENT, useValue: { auth } },
                provideRouter([
                    callback,
                    { path: 'login', component: Destination },
                    { path: 'tasks', component: Destination },
                ]),
            ],
        });
    });

    it('waits for session restoration and publishes the authenticated user', () => {
        const store = TestBed.inject(AuthStore);
        expect(store.initializing()).toBe(true);
        expect(store.userId()).toBeNull();
        emit('INITIAL_SESSION', session('A'));
        expect(store.initializing()).toBe(false);
        expect(store.userId()).toBe('A');
    });

    it('distinguishes a confirmed signed-out startup from pending initialization', () => {
        const store = TestBed.inject(AuthStore);
        emit('INITIAL_SESSION', null);
        expect(store.initializing()).toBe(false);
        expect(store.isAuthed()).toBe(false);
    });

    it('preserves login and logout through SDK events', async () => {
        const store = TestBed.inject(AuthStore);
        emit('INITIAL_SESSION', null);
        auth.signInWithPassword.mockImplementationOnce(async () => {
            emit('SIGNED_IN', session('A'));
            return { error: null };
        });
        auth.signOut.mockImplementationOnce(async () => {
            emit('SIGNED_OUT', null);
            return { error: null };
        });
        await store.signIn('a@example.test', 'fixture-password');
        expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.test', password: 'fixture-password' });
        expect(store.userId()).toBe('A');
        await store.signOut();
        expect(store.isAuthed()).toBe(false);
    });

    it.each([
        ['login', 'SIGNED_IN', session('B'), null, 'B'],
        ['logout', 'SIGNED_OUT', null, session('A'), null],
        ['account switch', 'SIGNED_IN', session('B'), session('A'), 'B'],
    ] as const)('ignores stale startup data after a newer %s', (_label, event, newer, stale, owner) => {
        const store = TestBed.inject(AuthStore);
        emit(event, newer);
        emit('INITIAL_SESSION', stale);
        expect(store.initializing()).toBe(false);
        expect(store.userId()).toBe(owner);
    });

    it('supplies the registered callback URL for email confirmation', async () => {
        auth.signUp.mockResolvedValueOnce({ error: null });
        await TestBed.inject(AuthStore).signUp('a@example.test', 'fixture-password');
        expect(auth.signUp).toHaveBeenCalledWith({
            email: 'a@example.test',
            password: 'fixture-password',
            options: { emailRedirectTo: new URL('auth/callback', document.baseURI).href },
        });
    });

    it.each([
        ['/auth/callback#access_token=synthetic', session('A'), '/tasks'],
        ['/auth/callback?error_code=otp_expired', null, '/login'],
    ] as const)('waits at %s for the SDK and replaces the callback URL', async (url, restored, destination) => {
        const router = TestBed.inject(Router);
        const navigate = vi.spyOn(router, 'navigateByUrl');
        const harness = await RouterTestingHarness.create(url);
        expect(router.url).toBe(url);
        expect(harness.routeNativeElement?.querySelector('[role="status"]')).toBeTruthy();

        emit('INITIAL_SESSION', restored);
        harness.detectChanges();
        await harness.fixture.whenStable();

        expect(router.url).toBe(destination);
        expect(navigate).toHaveBeenCalledWith(destination, { replaceUrl: true });
        expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });
});

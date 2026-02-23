import { Component, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '@/shared/supabase/auth.store';

@Component({
    imports: [
        CommonModule,
        ReactiveFormsModule
    ],
    templateUrl: './login.page.html',
    styleUrls: ['./login.page.scss'],
})
export class LoginPage {
    protected readonly busy = signal(false);
    protected readonly errorText = signal<string | null>(null);

    private readonly fb = inject(FormBuilder);
    private readonly auth = inject(AuthStore);
    private readonly router = inject(Router);

    protected readonly form = this.fb.nonNullable.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
    });

    protected get canSubmit(): boolean {
        return this.form.valid && !this.busy();
    }

    constructor() {
        // If already logged in, bounce to tasks.
        effect(() => {
            if (this.auth.isAuthed()) void this.router.navigateByUrl('/tasks');
        });
    }

    async signIn() {
        if (!this.form.valid) {
            this.form.markAllAsTouched();
            return;
        }

        await this.run(async () => {
            const { email, password } = this.form.getRawValue();
            await this.auth.signIn(email.trim(), password);
            await this.router.navigateByUrl('/tasks');
        });
    }

    async signUp() {
        if (!this.form.valid) {
            this.form.markAllAsTouched();
            return;
        }

        await this.run(async () => {
            const { email, password } = this.form.getRawValue();
            await this.auth.signUp(email.trim(), password);

            // If confirmations are enabled, you won't have a session yet.
            if (!this.auth.isAuthed()) {
                this.errorText.set('Account created. Check your email to confirm, then sign in.');
                return;
            }

            await this.router.navigateByUrl('/tasks');
        });
    }

    private async run(fn: () => Promise<void>) {
        this.errorText.set(null);
        this.busy.set(true);
        try {
            await fn();
        } catch (e: any) {
            this.errorText.set(e?.message ?? 'Something went wrong');
        } finally {
            this.busy.set(false);
        }
    }
}

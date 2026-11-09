import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AppShellComponent } from './app-shell.component';
import { AuthStore } from '@/shared/supabase/auth.store';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import { ProjectsStore } from '@/features/projects/state/projects.store';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import type { Project } from '@/features/projects/models/project.model';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

describe('Shell project loading recovery', () => {
    let fixture: ComponentFixture<AppShellComponent>;
    let store: ProjectsStore;
    const owner = signal<string | null>('A');
    const from = vi.fn();
    function request() {
        const response = deferred<{ data: Project[] | null; error: Error | null }>();
        from.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue(response.promise) }) });
        return response;
    }
    async function settle() { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
    beforeEach(async () => {
        owner.set('A'); from.mockReset();
        await TestBed.configureTestingModule({ imports: [AppShellComponent], providers: [
            provideRouter([]),
            { provide: BreakpointObserver, useValue: { isMatched: () => false, observe: () => of({ matches: false }) } },
            { provide: AuthStore, useValue: { userId: owner, isAuthed: computed(() => owner() !== null), user: computed(() => owner() ? { id: owner(), email: 'fixture@example.test' } : null) } },
            { provide: SUPABASE_CLIENT, useValue: { from } },
            { provide: TasksStore, useValue: { tasks: signal([]) } },
        ] }).compileComponents();
    });
    afterEach(() => { fixture.destroy(); fixture.nativeElement.remove(); });
    function createShell() {
        fixture = TestBed.createComponent(AppShellComponent); document.body.appendChild(fixture.nativeElement);
        store = TestBed.inject(ProjectsStore); fixture.detectChanges();
    }
    it('shows a project loading failure already recorded by the store with a retry control', async () => {
        const initial = request(); createShell(); await settle();
        initial.reject(new Error('Network unavailable')); await settle();
        expect(store.error()).toBe('Network unavailable');
        expect(fixture.nativeElement.querySelector('.app-sidebar [role="alert"]')?.textContent).toContain('Could not load projects');
        expect(Array.from(fixture.nativeElement.querySelectorAll('button')).some(item => (item as HTMLButtonElement).textContent?.includes('Retry loading projects'))).toBe(true);
    });
    it('retries failed loading once, handles another rejection, and restores project navigation after success', async () => {
        const initial = request(); createShell(); await settle(); initial.reject(new Error('Offline')); await settle();
        const retryButton = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.includes('Retry loading projects'))!;
        const again = request(); retryButton().click(); retryButton().click(); await settle();
        expect(from).toHaveBeenCalledTimes(2); expect(retryButton().disabled).toBe(true);
        again.reject(new Error('Still offline')); await settle();
        expect(store.loadError()).toBe('Still offline'); expect(retryButton().disabled).toBe(false);
        const successful = request(); retryButton().click(); await settle();
        successful.resolve({ data: [{ id: 'loaded', user_id: 'A', name: 'Loaded project', parent_project_id: null, created_at: '', updated_at: '' }], error: null });
        await settle();
        expect(store.loadError()).toBeNull();
        expect(fixture.nativeElement.querySelector('.project-load-error')).toBeNull();
        expect(fixture.nativeElement.querySelector('a[href="/tasks/project/loaded"]')?.textContent).toContain('Loaded project');
    });

    it('suppresses an old retry failure after account switching', async () => {
        const initial = request(); createShell(); await settle(); initial.reject(new Error('A failure')); await settle();
        const retry = request();
        (Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.includes('Retry loading projects'))!).click();
        const b = request(); owner.set('B'); await settle();
        retry.reject(new Error('Old retry failed')); await settle();
        expect(store.loadError()).toBeNull(); expect(fixture.nativeElement.querySelector('.project-load-error')).toBeNull();
        b.resolve({ data: [], error: null }); await settle();
        expect(store.loading()).toBe(false);
    });

    it('does not present CRUD failures as project loading failures', async () => {
        const initial = request(); createShell(); await settle(); initial.resolve({ data: [], error: null }); await settle();
        from.mockReturnValueOnce({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Create denied') }) }) }) });
        await expect(store.createProject({ name: 'Project', parentProjectId: null })).rejects.toThrow('Create denied');
        await settle(); expect(store.error()).toBe('Create denied'); expect(store.loadError()).toBeNull();
        expect(fixture.nativeElement.querySelector('.project-load-error')).toBeNull();
    });

});

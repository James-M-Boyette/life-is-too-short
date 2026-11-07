import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { ReplaySubject } from 'rxjs';
import { vi } from 'vitest';
import { AppShellComponent } from './app-shell.component';
import { AppSidebarComponent } from './app-sidebar/app-sidebar.component';
import { AuthStore } from '@/shared/supabase/auth.store';
import { ProjectsStore } from '@/features/projects/state/projects.store';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import type { ProjectNode } from '@/features/projects/models/project.model';
import { TaskCreateComponent } from '@/features/tasks/components/task-create/task-create.component';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import { ThemePaletteService } from '@/shared/theme/theme-palette.service';
import { PALETTE_OPTIONS } from '@/shared/theme/theme-palette';

@Component({ standalone: true, template: '<h1>Test task page</h1>' })
class TestPage {}
const project = (id: string, children: ProjectNode[] = []): ProjectNode => ({
    project: { id, name: id, user_id: 'test', parent_project_id: null, created_at: '', updated_at: '' }, children,
});

describe('responsive AppShellComponent', () => {
    let fixture: ComponentFixture<AppShellComponent>;
    let viewport: ReplaySubject<BreakpointState>;
    let tree: ReturnType<typeof signal<ProjectNode[]>>;
    const signOut = vi.fn().mockResolvedValue(undefined);
    const button = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name)!;
    async function settle() {
        fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
        // JSDOM does not run PrimeNG's CSS mask leave animation.
        document.querySelectorAll('.p-overlay-mask-leave-active').forEach(mask => mask.dispatchEvent(new Event('animationend')));
    }
    async function resize(mobile: boolean) {
        viewport.next({ matches: mobile, breakpoints: { '(width < 768px)': mobile } }); await settle();
    }
    async function open() { button('Show navigation').click(); await settle(); }
    beforeEach(async () => {
        signOut.mockClear();
        viewport = new ReplaySubject<BreakpointState>(1);
        viewport.next({ matches: true, breakpoints: {} });
        tree = signal([project('Parent', [project('Child')])]);
        await TestBed.configureTestingModule({
            imports: [AppShellComponent],
            providers: [
                provideRouter([{ path: '**', component: TestPage }]),
                { provide: BreakpointObserver, useValue: { isMatched: () => true, observe: () => viewport.asObservable() } },
                { provide: AuthStore, useValue: { isAuthed: signal(true), user: signal({ email: 'test@example.com' }), signOut } },
                { provide: ProjectsStore, useValue: { projectTree: tree, projects: signal([project('Parent').project]), getProject: () => project('Parent').project } },
                { provide: TasksStore, useValue: { tasks: signal([]) } },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(AppShellComponent);
        document.body.appendChild(fixture.nativeElement);
        await settle();
    });
    afterEach(() => { fixture.destroy(); viewport.complete(); });

    it('opens a modal drawer, closes explicitly and by backdrop, and restores toggle focus', async () => {
        const toggle = button('Show navigation');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        await open();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(document.querySelector('[role="dialog"][aria-label="Navigation"]')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('.app-shell').hasAttribute('inert')).toBe(true);
        button('Close navigation').click(); await settle();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(toggle);
        await open();
        (document.querySelector('.p-drawer-mask') as HTMLElement).click(); await settle();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        await open();
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        // PrimeNG's document listener reads legacy `which`, supplied by native key events.
        Object.defineProperty(escape, 'which', { value: 27 });
        document.dispatchEvent(escape); await settle();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes after all navigation destinations, including the already selected route', async () => {
        for (const path of ['/tasks/inbox', '/tasks/today', '/tasks/upcoming', '/tasks', '/tasks/project/Parent', '/tasks/project/Parent']) {
            await open();
            (document.querySelector(`.app-sidebar a[href="${path}"]`) as HTMLAnchorElement).click();
            await settle();
            expect(button('Show navigation').getAttribute('aria-expanded')).toBe('false');
            expect(TestBed.inject(Router).url).toBe(path);
        }
    });

    it('closes navigation when routing is initiated outside the sidebar', async () => {
        await open();
        await TestBed.inject(Router).navigateByUrl('/tasks/upcoming'); await settle();
        expect(button('Show navigation').getAttribute('aria-expanded')).toBe('false');
        expect(fixture.nativeElement.querySelector('.app-shell').hasAttribute('inert')).toBe(false);
    });

    it('retains the same expanded sidebar and live bindings across closing and desktop transitions', async () => {
        const sidebar = fixture.debugElement.query(By.directive(AppSidebarComponent)).componentInstance;
        await open(); button('Expand all').click(); await settle();
        expect(document.querySelector('.app-sidebar a[href="/tasks/project/Child"]')).toBeTruthy();
        button('Close navigation').click(); await settle(); await open();
        expect(document.querySelector('.app-sidebar a[href="/tasks/project/Child"]')).toBeTruthy();
        tree.set([project('Parent', [project('Child'), project('New child')])]); await settle();
        expect(document.querySelector('.app-sidebar a[href="/tasks/project/New%20child"]')).toBeTruthy();
        await resize(false);
        expect(fixture.debugElement.query(By.directive(AppSidebarComponent)).componentInstance).toBe(sidebar);
        expect(fixture.nativeElement.querySelector('.desktop-navigation .app-sidebar a[href="/tasks/project/Child"]')).toBeTruthy();
        expect(button('Show navigation')).toBeUndefined();
        expect(fixture.nativeElement.querySelector('.app-top-bar app-account-controls')?.textContent).toContain('test@example.com');
        const separator = fixture.nativeElement.querySelector('[role="separator"]');
        separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await settle();
        expect(separator.getAttribute('aria-valuenow')).toBe('270');
        await resize(true);
        expect(button('Show navigation').getAttribute('aria-expanded')).toBe('false');
        await resize(false);
        expect(separator.getAttribute('aria-valuenow')).toBe('270');
    });

    it('preserves mobile task creation, palette choice and sign out', async () => {
        await TestBed.inject(Router).navigateByUrl('/tasks/today'); await settle();
        button('Add task').click(); await settle();
        expect(document.querySelector('app-task-create')).toBeTruthy();
        expect(fixture.debugElement.query(By.directive(TaskCreateComponent)).componentInstance.defaultPlannedDate()).toBe(TestBed.inject(CalendarClockService).today());
        button('Cancel').click(); await settle();
        expect(document.querySelector('app-task-create')).toBeNull();
        expect(document.activeElement).toBe(button('Add task'));
        await open();
        expect(document.querySelector('.mobile-account')?.textContent).toContain('test@example.com');
        const select = document.querySelector('.mobile-account select') as HTMLSelectElement;
        select.value = PALETTE_OPTIONS[1].id; select.dispatchEvent(new Event('change')); await settle();
        expect(TestBed.inject(ThemePaletteService).palette()).toBe(PALETTE_OPTIONS[1].id);
        button('Sign Out').click(); await settle();
        expect(signOut).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/login'));
    });

    it('opens existing project dialogs from the drawer without leaving it active', async () => {
        await open(); button('Create a project').click(); await settle();
        expect(button('Show navigation').getAttribute('aria-expanded')).toBe('false');
        expect(document.querySelector('app-project-editor')).toBeTruthy();
        button('Cancel').click(); await settle();
        expect(document.activeElement).toBe(button('Show navigation'));
        await open(); button('Edit Parent').click(); await settle();
        expect((document.querySelector('app-project-editor input') as HTMLInputElement).value).toBe('Parent');
        expect(button('Show navigation').getAttribute('aria-expanded')).toBe('false');
        button('Cancel').click(); await settle();
        await open(); button('Delete Parent').click(); await settle();
        expect(document.body.textContent).toContain('Delete project?');
        expect(button('Show navigation').getAttribute('aria-expanded')).toBe('false');
        button('Cancel').click(); await settle();
        expect(document.activeElement).toBe(button('Show navigation'));
    });
});

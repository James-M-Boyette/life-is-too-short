import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AppShellComponent } from '@/layout/app-shell/app-shell.component';
import { TasksPage } from '@/features/tasks/pages/tasks.page';
import { AuthStore } from '@/shared/supabase/auth.store';
import { ProjectsStore } from '../state/projects.store';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import { CalendarClockService } from '@/shared/services/calendar-clock.service';
import { buildProjectTree } from '../utils/project-tree.util';
import type { Project } from '../models/project.model';
import { ProjectDialogService } from './project-dialog.service';

const project = (id: string): Project => ({ id, name: id, user_id: 'owner', parent_project_id: null, created_at: '', updated_at: '' });

describe('Project page dialogs through the existing shell', () => {
    let fixture: ComponentFixture<AppShellComponent>;
    const projects = signal<Project[]>([]);
    const userId = signal<string | null>('owner');
    const remove = vi.fn();
    const refresh = vi.fn();
    const button = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find(item => item.getAttribute('aria-label') === name || item.textContent?.trim() === name)!;
    const menuItem = (label: string) => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"] a'))
        .find(item => item.textContent?.trim() === label)!;
    async function settle() {
        fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
        document.querySelectorAll('.p-overlay-mask-leave-active').forEach(mask => mask.dispatchEvent(new Event('animationend')));
    }
    async function select(label: string) {
        await vi.waitFor(() => expect(button('More actions for project First').getAttribute('aria-expanded')).toBe('false'));
        button('More actions for project First').click(); await settle();
        menuItem(label).click(); await settle();
    }
    beforeEach(async () => {
        projects.set([project('First'), project('Second')]); userId.set('owner');
        refresh.mockReset().mockResolvedValue(undefined);
        remove.mockReset().mockImplementation(async (id: string) => projects.update(items => items.filter(item => item.id !== id)));
        await TestBed.configureTestingModule({
            imports: [AppShellComponent],
            providers: [
                provideRouter([
                    { path: 'tasks/project/:projectId', component: TasksPage, data: { view: 'project' } },
                    { path: 'tasks/inbox', component: TasksPage, data: { view: 'inbox' } },
                ], withComponentInputBinding()),
                { provide: BreakpointObserver, useValue: { isMatched: () => false, observe: () => of({ matches: false }) } },
                { provide: AuthStore, useValue: { userId, user: computed(() => ({ id: userId(), email: 'fixture@example.com' })), isAuthed: signal(true) } },
                { provide: ProjectsStore, useValue: { projects, projectTree: computed(() => buildProjectTree(projects())), getProject: (id: string) => projects().find(item => item.id === id), deleteProject: remove } },
                { provide: TasksStore, useValue: { tasks: signal([]), loading: signal(false), mutating: signal(false), error: signal(null), realtimeConnected: signal(false), refreshTasks: refresh } },
                { provide: CalendarClockService, useValue: { today: signal('2026-11-08') } },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(AppShellComponent); document.body.appendChild(fixture.nativeElement);
        await settle(); await TestBed.inject(Router).navigateByUrl('/tasks/project/First'); await settle();
    });
    afterEach(() => { fixture.destroy(); fixture.nativeElement.remove(); });

    it('opens the existing prefilled editor and confirmation, cancels without mutations and restores page focus', async () => {
        await select('Edit project');
        expect((document.querySelector('app-project-editor input') as HTMLInputElement).value).toBe('First');
        expect(document.querySelectorAll('app-project-editor')).toHaveLength(1);
        const origin = button('More actions for project First');
        button('Cancel').click(); await settle();
        expect(document.activeElement).toBe(origin);
        await select('Delete project');
        expect(document.querySelector('.p-dialog')?.textContent).toContain('First');
        button('Cancel').click(); await settle();
        expect(projects()).toHaveLength(2);
        expect(remove).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(origin);
    });

    it('uses the existing deletion workflow once and navigates the deleted project to Inbox', async () => {
        await select('Delete project');
        button('Delete project').click(); button('Delete project').click(); await settle();
        expect(remove).toHaveBeenCalledExactlyOnceWith('First');
        expect(refresh).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/tasks/inbox'));
        await settle();
        expect(document.querySelector('.project-page-more')).toBeNull();
    });

    it('rejects stale requests and closes a page-originated editor on route/session changes', async () => {
        const coordinator = fixture.debugElement.injector.get(ProjectDialogService);
        const origin = button('More actions for project First');
        const intent = { action: 'edit' as const, projectId: 'First', userId: 'owner', sourceUrl: '/tasks/project/First', trigger: origin };
        for (const invalid of [{ projectId: 'missing' }, { userId: 'another' }, { sourceUrl: '/tasks/project/Second' }]) {
            coordinator.open({ ...intent, ...invalid }); await settle();
            expect(document.querySelector('app-project-editor')).toBeNull();
        }
        await select('Edit project');
        await TestBed.inject(Router).navigateByUrl('/tasks/project/Second'); await settle();
        expect(document.querySelector('app-project-editor')).toBeNull();
        await TestBed.inject(Router).navigateByUrl('/tasks/project/First'); await settle();
        await select('Edit project'); userId.set('another'); await settle();
        expect(document.querySelector('app-project-editor')).toBeNull();
        expect(remove).not.toHaveBeenCalled();
    });

    it('rejects confirmation immediately after account change, before the closing effect runs', async () => {
        await select('Delete project');
        userId.set('another');
        button('Delete project').click();
        await settle();
        expect(remove).not.toHaveBeenCalled();
    });

    it('does not show a late delete error or navigate after the account changes', async () => {
        let reject!: (error: Error) => void;
        remove.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
        await select('Delete project'); button('Delete project').click(); fixture.detectChanges();
        userId.set('another'); await settle();
        reject(new Error('Old account failure')); await settle();
        expect(document.querySelector('.p-dialog')).toBeNull();
        expect(document.body.textContent).not.toContain('Old account failure');
        expect(TestBed.inject(Router).url).toBe('/tasks/project/First');
        expect(refresh).not.toHaveBeenCalled();
    });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, computed, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AppShellComponent } from './app-shell.component';
import { AppSidebarComponent } from './app-sidebar/app-sidebar.component';
import { AuthStore } from '@/shared/supabase/auth.store';
import { ProjectsStore } from '@/features/projects/state/projects.store';
import { TasksStore } from '@/features/tasks/state/tasks.store';
import type { Project } from '@/features/projects/models/project.model';
import { buildProjectTree } from '@/features/projects/utils/project-tree.util';
import { ProjectDialogService } from '@/features/projects/services/project-dialog.service';
import { TaskCreateDialogService } from '@/features/tasks/services/task-create-dialog.service';

@Component({ standalone: true, template: '<h1 tabindex="-1">Current page</h1>' })
class SessionPage {}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const project = (owner: string): Project => ({
    id: owner + '-project', user_id: owner, name: owner + ' project', parent_project_id: null, created_at: '', updated_at: '',
});

describe('Shell dialog account ownership', () => {
    let fixture: ComponentFixture<AppShellComponent>;
    const userId = signal<string | null>('A');
    const projects = signal<Project[]>([]);
    const addTask = vi.fn(); const createProject = vi.fn(); const updateProject = vi.fn();
    const deleteProject = vi.fn(); const refreshTasks = vi.fn();
    const button = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find(item => item.getAttribute('aria-label') === name || item.textContent?.trim() === name)!;
    const input = () => document.querySelector<HTMLInputElement>('app-task-create input, app-project-editor input')!;
    const sidebar = () => fixture.debugElement.query(By.directive(AppSidebarComponent)).componentInstance as AppSidebarComponent;
    async function settle() {
        fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
        document.querySelectorAll('.p-overlay-mask-leave-active').forEach(mask => mask.dispatchEvent(new Event('animationend')));
    }
    function changeAccount(owner: string | null) {
        userId.set(owner); projects.set(owner ? [project(owner)] : []);
    }
    function setDraft(value: string) { input().value = value; input().dispatchEvent(new Event('input', { bubbles: true })); }
    function submit() { document.querySelector('app-task-create form, app-project-editor form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
    const openers = {
        task: () => button('Add task').click(),
        create: () => sidebar().createProject.emit(),
        edit: () => sidebar().editProject.emit(project(userId()!).id),
        delete: () => sidebar().deleteProject.emit(project(userId()!).id),
    };
    beforeEach(async () => {
        changeAccount('A');
        for (const mock of [addTask, createProject, updateProject, deleteProject, refreshTasks]) mock.mockReset();
        addTask.mockResolvedValue(undefined); createProject.mockImplementation(async () => project(userId()!));
        updateProject.mockImplementation(async () => project(userId()!)); deleteProject.mockResolvedValue(undefined); refreshTasks.mockResolvedValue(undefined);
        await TestBed.configureTestingModule({ imports: [AppShellComponent], providers: [
            provideRouter([{ path: '**', component: SessionPage }]),
            { provide: BreakpointObserver, useValue: { isMatched: () => true, observe: () => of({ matches: true }) } },
            { provide: AuthStore, useValue: { userId, isAuthed: computed(() => userId() !== null), user: computed(() => userId() ? { id: userId(), email: userId() + '@example.test' } : null) } },
            { provide: ProjectsStore, useValue: { projects, loadError: signal(null), projectTree: computed(() => buildProjectTree(projects())), getProject: (id: string) => projects().find(item => item.id === id), createProject, updateProject, deleteProject } },
            { provide: TasksStore, useValue: { tasks: signal([]), addTask, refreshTasks } },
        ] }).compileComponents();
        fixture = TestBed.createComponent(AppShellComponent); document.body.appendChild(fixture.nativeElement);
        await settle(); await TestBed.inject(Router).navigateByUrl('/tasks/today'); await settle();
    });
    afterEach(() => { fixture.destroy(); fixture.nativeElement.remove(); });

    for (const kind of ['task', 'create', 'edit', 'delete'] as const) {
        it(`closes the ${kind} dialog and clears account-owned content on direct switch and logout`, async () => {
            openers[kind](); await settle();
            if (kind !== 'delete') setDraft('Private A draft');
            changeAccount('B'); await settle();
            expect(document.querySelector('.p-dialog')).toBeNull();
            expect(document.querySelector('app-task-create, app-project-editor')).toBeNull();
            expect(fixture.debugElement.injector.get(TaskCreateDialogService).context()).toBeNull();
            openers[kind](); await settle();
            if (kind !== 'delete') expect(input().value).not.toContain('Private A draft');
            changeAccount(null); await settle();
            expect(document.querySelector('.p-dialog')).toBeNull();
            expect(TestBed.inject(Router).url).toBe('/login');
            expect(addTask).not.toHaveBeenCalled(); expect(createProject).not.toHaveBeenCalled();
            expect(updateProject).not.toHaveBeenCalled(); expect(deleteProject).not.toHaveBeenCalled();
        });
    }
    it('does not publish a late task creation failure after switching accounts', async () => {
        const pending = deferred<void>(); addTask.mockReturnValueOnce(pending.promise);
        openers.task(); await settle(); setDraft('A task'); submit(); await settle();
        expect(addTask).toHaveBeenCalledTimes(1);
        changeAccount('B'); await settle();
        pending.reject(new Error('Private A failure')); await settle();
        expect(document.body.textContent).not.toContain('Private A failure');
        expect(document.querySelector('app-task-create')).toBeNull();
    });

    for (const kind of ['task', 'create', 'edit', 'delete'] as const) {
        it(`rejects stale ${kind} submission before the account-closing effect runs`, async () => {
            openers[kind](); await settle();
            if (kind !== 'delete') setDraft('A draft');
            changeAccount('B');
            if (kind === 'delete') button('Delete project').click(); else submit();
            await settle();
            expect(addTask).not.toHaveBeenCalled(); expect(updateProject).not.toHaveBeenCalled();
            expect(deleteProject).not.toHaveBeenCalled();
        });
    }

    for (const kind of ['task', 'create', 'edit', 'delete'] as const) {
        for (const fails of [false, true]) {
            it(`isolates late ${kind} ${fails ? 'failure' : 'success'} from the new account's pending dialog and focus`, async () => {
                const operation = { task: addTask, create: createProject, edit: updateProject, delete: deleteProject }[kind];
                const old = deferred<Project | void>(); operation.mockReturnValueOnce(old.promise);
                openers[kind](); await settle();
                if (kind !== 'delete') setDraft('A draft');
                if (kind === 'delete') { button('Delete project').click(); button('Delete project').click(); }
                else { submit(); submit(); }
                await settle(); expect(operation).toHaveBeenCalledTimes(1);
                changeAccount('B'); await settle();
                const current = deferred<Project | void>(); operation.mockReturnValueOnce(current.promise);
                openers[kind](); await settle();
                if (kind !== 'delete') setDraft('B draft');
                if (kind === 'delete') button('Delete project').click(); else submit();
                await settle(); expect(operation).toHaveBeenCalledTimes(2);
                const destination = document.querySelector<HTMLElement>('h1')!; destination.focus();
                if (fails) old.reject(new Error('Private A error'));
                else old.resolve(kind === 'create' || kind === 'edit' ? project('A') : undefined);
                await settle();
                expect(document.querySelector('.p-dialog')).not.toBeNull();
                expect(document.body.textContent).not.toContain('Private A error');
                expect(document.activeElement).toBe(destination);
                expect(TestBed.inject(Router).url).toBe('/tasks/today');
                expect(refreshTasks).not.toHaveBeenCalled();
                if (kind === 'delete') {
                    expect(document.querySelector('.p-dialog')?.textContent).toContain('B project');
                    expect(button('Delete project').disabled).toBe(true);
                    button('Delete project').click();
                } else {
                    expect(input().value).toBe('B draft'); submit();
                }
                await settle(); expect(operation).toHaveBeenCalledTimes(2);
                current.resolve(kind === 'create' || kind === 'edit' ? project('B') : undefined);
                await settle();
                expect(document.querySelector('.p-dialog')).toBeNull();
                expect(refreshTasks).toHaveBeenCalledTimes(kind === 'delete' ? 1 : 0);
            });
        }
    }

    for (const kind of ['task', 'create', 'edit'] as const) {
        it(`keeps current-session ${kind} failure visible for retry and closes only after success`, async () => {
            const operation = { task: addTask, create: createProject, edit: updateProject }[kind];
            const pending = deferred<Project | void>(); operation.mockReturnValueOnce(pending.promise);
            openers[kind](); await settle(); setDraft('Current draft'); submit(); await settle();
            pending.reject(new Error('Current save failed')); await settle();
            expect(document.querySelector('[role="alert"]')?.textContent).toContain('Current save failed');
            expect(input().value).toBe('Current draft');
            submit(); await settle();
            expect(operation).toHaveBeenCalledTimes(2); expect(document.querySelector('.p-dialog')).toBeNull();
            expect(document.activeElement).toBe(button(kind === 'task' ? 'Add task' : 'Show navigation'));
        });
    }

    it('invalidates the session generation even when the same account reauthenticates before an old deletion succeeds', async () => {
        const old = deferred<void>(); deleteProject.mockReturnValueOnce(old.promise);
        openers.delete(); await settle(); button('Delete project').click(); await settle();
        changeAccount(null); await settle(); changeAccount('A'); await settle();
        await TestBed.inject(Router).navigateByUrl('/tasks/project/A-project'); await settle();
        openers.delete(); await settle();
        const destination = document.querySelector<HTMLElement>('h1')!; destination.focus();
        old.resolve(); await settle();
        expect(document.querySelector('.p-dialog')?.textContent).toContain('A project');
        expect(TestBed.inject(Router).url).toBe('/tasks/project/A-project');
        expect(refreshTasks).not.toHaveBeenCalled(); expect(document.activeElement).toBe(destination);
    });

    it('clears page-requested task context and cannot reuse an old project when opening from the new account', async () => {
        const coordinator = fixture.debugElement.injector.get(TaskCreateDialogService);
        coordinator.open({ projectId: 'A-project', plannedDate: '2026-11-10' }); await settle();
        setDraft('A page task');
        changeAccount('B'); await settle();
        expect(coordinator.context()).toBeNull();
        await TestBed.inject(Router).navigateByUrl('/tasks/project/A-project'); await settle();
        openers.task(); await settle();
        expect(coordinator.context()).toEqual({ projectId: null, plannedDate: null });
        expect(input().value).toBe('');
    });

    it('does not restore a queued mobile cancel focus to the previous session trigger', async () => {
        openers.task(); await settle();
        button('Cancel').click(); // schedules afterNextRender focus restoration
        changeAccount('B');
        const destination = document.querySelector<HTMLElement>('h1')!; destination.focus();
        await settle();
        expect(document.activeElement).toBe(destination);
        expect(document.querySelector('.p-dialog')).toBeNull();
    });

    it('does not let a page save dismissed by navigation clear a newer same-account sidebar save', async () => {
        await TestBed.inject(Router).navigateByUrl('/tasks/project/A-project'); await settle();
        const old = deferred<Project>(); updateProject.mockReturnValueOnce(old.promise);
        fixture.debugElement.injector.get(ProjectDialogService).open({
            action: 'edit', projectId: 'A-project', userId: 'A', sourceUrl: '/tasks/project/A-project',
            trigger: document.querySelector<HTMLElement>('h1')!,
        });
        await settle(); setDraft('Page draft'); submit(); await settle();
        await TestBed.inject(Router).navigateByUrl('/tasks/today'); await settle();
        const current = deferred<Project>(); createProject.mockReturnValueOnce(current.promise);
        openers.create(); await settle(); setDraft('Sidebar draft'); submit(); await settle();
        expect(createProject).toHaveBeenCalledTimes(1);
        old.reject(new Error('Obsolete page error')); await settle();
        expect(input().value).toBe('Sidebar draft');
        expect(document.body.textContent).not.toContain('Obsolete page error');
        submit(); await settle(); expect(createProject).toHaveBeenCalledTimes(1);
        current.resolve(project('A')); await settle(); expect(document.querySelector('.p-dialog')).toBeNull();
    });

    it('handles a deletion reconciliation rejection after an account switch without stale UI or navigation', async () => {
        const pending = deferred<void>(); refreshTasks.mockReturnValueOnce(pending.promise);
        openers.delete(); await settle(); button('Delete project').click(); await settle();
        expect(refreshTasks).toHaveBeenCalledTimes(1);
        changeAccount('B'); await settle();
        const destination = document.querySelector<HTMLElement>('h1')!; destination.focus();
        pending.reject(new Error('Obsolete reconciliation failure')); await settle();
        expect(document.querySelector('.p-dialog')).toBeNull();
        expect(document.body.textContent).not.toContain('Obsolete reconciliation failure');
        expect(TestBed.inject(Router).url).toBe('/tasks/today'); expect(document.activeElement).toBe(destination);
    });

    it('starts fresh project drafts when edit or create dialogs are cancelled and reopened', async () => {
        openers.edit(); await settle(); setDraft('Unsaved edit');
        button('Cancel').click(); await settle();
        expect(document.querySelector('app-project-editor')).toBeNull();
        openers.edit(); await settle(); expect(input().value).toBe('A project');
        button('Cancel').click(); await settle();
        openers.create(); await settle(); expect(input().value).toBe(''); setDraft('Unsaved create');
        button('Cancel').click(); await settle();
        openers.create(); await settle(); expect(input().value).toBe('');
        expect(createProject).not.toHaveBeenCalled(); expect(updateProject).not.toHaveBeenCalled();
    });

});

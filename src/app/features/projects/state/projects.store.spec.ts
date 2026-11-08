import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { AuthStore } from '@/shared/supabase/auth.store';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import { ProjectsStore } from './projects.store';
import type { Project } from '../models/project.model';

const client = { from: vi.fn(), rpc: vi.fn() };

type Result = { data: Project[] | Project | null; error: Error | null };
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const project = (id: string, user = 'A', parent: string | null = null): Project => ({
    id, user_id: user, name: id, parent_project_id: parent, created_at: '', updated_at: '',
});

describe('ProjectsStore account isolation', () => {
    let store: ProjectsStore;
    const userId = signal<string | null>(null);
    function query() {
        const response = deferred<Result>();
        const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn(), insert: vi.fn(), update: vi.fn() };
        for (const method of ['select', 'eq', 'insert', 'update'] as const) chain[method].mockReturnValue(chain);
        chain.order.mockReturnValue(response.promise); chain.single.mockReturnValue(response.promise);
        client.from.mockReturnValueOnce(chain);
        return { ...response, chain };
    }
    async function finish(request: ReturnType<typeof query>, data: Project[]) {
        request.resolve({ data, error: null }); await request.promise; TestBed.tick();
    }
    beforeEach(() => {
        userId.set(null); client.from.mockReset(); client.rpc.mockReset();
        TestBed.configureTestingModule({ providers: [
            ProjectsStore, { provide: AuthStore, useValue: { userId } },
            { provide: SUPABASE_CLIENT, useValue: client },
        ] });
        store = TestBed.inject(ProjectsStore); TestBed.tick();
    });


    it('does not overwrite B projects when an earlier A refresh completes afterward', async () => {
        const a = query(); userId.set('A'); TestBed.tick();
        const b = query(); userId.set('B'); TestBed.tick();
        await finish(b, [project('B-project', 'B')]);
        expect(store.projects()).toEqual([project('B-project', 'B')]);
        await finish(a, [project('A-project')]);
        expect(store.projects()).toEqual([project('B-project', 'B')]);
        expect(store.error()).toBeNull(); expect(store.loading()).toBe(false);
    });
    it('loads the initially authenticated account and clears state on logout before completion', async () => {
        const request = query(); userId.set('A'); TestBed.tick();
        expect(request.chain.select).toHaveBeenCalledWith('*');
        expect(store.loading()).toBe(true);
        userId.set(null); TestBed.tick();
        expect(store.loading()).toBe(false);
        await finish(request, [project('old')]);
        expect(store.projects()).toEqual([]);
        expect(store.error()).toBeNull();
    });

    it('clears loaded rows immediately on account switching and loads again after reauthentication', async () => {
        const a = query(); userId.set('A'); TestBed.tick(); await finish(a, [project('a')]);
        const b = query(); userId.set('B'); TestBed.tick();
        expect(store.projects()).toEqual([]);
        await finish(b, [project('b', 'B')]);
        userId.set(null); TestBed.tick();
        expect(store.projects()).toEqual([]);
        const again = query(); userId.set('A'); TestBed.tick(); await finish(again, [project('again')]);
        expect(store.projects()).toEqual([project('again')]);
    });

    it('handles automatic refresh rejection and ignores old-account failures', async () => {
        const a = query(); userId.set('A'); TestBed.tick();
        a.reject(new Error('current failure')); await a.promise.catch(() => undefined); TestBed.tick();
        expect(store.error()).toBe('current failure');
        const old = query(); const pending = store.refresh().catch(() => undefined);
        const b = query(); userId.set('B'); TestBed.tick();
        old.reject(new Error('obsolete')); await pending;
        expect(store.error()).toBeNull(); expect(store.loading()).toBe(true);
        await finish(b, [project('b', 'B')]);
    });

    it('gives the latest refresh ownership of data, loading, and errors', async () => {
        const first = query(); userId.set('A'); TestBed.tick();
        const second = query(); const pending = store.refresh().catch(() => undefined);
        first.reject(new Error('older')); await first.promise.catch(() => undefined);
        expect(store.loading()).toBe(true); expect(store.error()).toBeNull();
        second.reject(new Error('newer')); await pending;
        expect(store.loading()).toBe(false); expect(store.error()).toBe('newer');
        const third = query(); const thirdPending = store.refresh();
        const fourth = query(); const fourthPending = store.refresh();
        await finish(fourth, [project('newest')]); await fourthPending;
        await finish(third, [project('older')]); await thirdPending;
        expect(store.projects()).toEqual([project('newest')]);
        expect(store.error()).toBeNull();
    });

    for (const operation of ['create', 'update', 'delete'] as const) {
        for (const fails of [false, true]) {
            it(`ignores obsolete ${operation} ${fails ? 'failure' : 'success'} after account switching`, async () => {
                const initial = query(); userId.set('A'); TestBed.tick();
                await finish(initial, [project('shared'), project('child', 'A', 'shared')]);
                const request = operation === 'delete' ? deferred<Result>() : query();
                if (operation === 'delete') client.rpc.mockReturnValueOnce(request.promise);
                const pending = (operation === 'create'
                    ? store.createProject({ name: 'created', parentProjectId: null })
                    : operation === 'update'
                        ? store.updateProject({ projectId: 'shared', name: 'edited', parentProjectId: null })
                        : store.deleteProject('shared')).catch(error => error);
                const b = query(); userId.set('B'); TestBed.tick();
                // Same ids make unintended replacement/removal observable too.
                const bRows = [project('shared', 'B'), project('child', 'B', 'shared')];
                await finish(b, bRows);
                if (fails) request.reject(new Error('A failed'));
                else request.resolve({ data: project('shared'), error: null });
                await pending;
                expect(store.projects()).toEqual(bRows);
                expect(store.error()).toBeNull(); expect(store.loading()).toBe(false);
            });
        }
    }

    it('preserves current-account create, reparent, and deletion semantics', async () => {
        const initial = query(); userId.set('A'); TestBed.tick(); await finish(initial, [project('parent')]);
        const create = query(); const created = store.createProject({ name: ' child ', parentProjectId: 'parent' });
        create.resolve({ data: project('child', 'A', 'parent'), error: null }); await created;
        expect(create.chain.insert).toHaveBeenCalledWith({ user_id: 'A', name: 'child', parent_project_id: 'parent' });
        const update = query(); const updated = store.updateProject({ projectId: 'child', name: 'renamed', parentProjectId: null });
        update.resolve({ data: { ...project('child'), name: 'renamed' }, error: null }); await updated;
        expect(store.getProject('child')?.name).toBe('renamed');
        store.projects.update(rows => rows.map(row => row.id === 'child' ? { ...row, parent_project_id: 'parent' } : row));
        const remove = deferred<Result>(); client.rpc.mockReturnValueOnce(remove.promise);
        const removed = store.deleteProject('parent'); remove.resolve({ data: null, error: null }); await removed;
        expect(store.projects()).toEqual([{ ...project('child'), name: 'renamed' }]);
        expect(client.rpc).toHaveBeenCalledWith('delete_project', { p_project_id: 'parent' });
    });

    it('keeps a newer mutation error when an older refresh fails, and permits retry', async () => {
        const initial = query(); userId.set('A'); TestBed.tick(); await finish(initial, [project('existing')]);
        const old = query(); const refresh = store.refresh().catch(() => undefined);
        const create = query(); const mutation = store.createProject({ name: 'new', parentProjectId: null }).catch(() => undefined);
        create.resolve({ data: null, error: new Error('create denied') }); await mutation;
        old.reject(new Error('old refresh')); await refresh;
        expect(store.error()).toBe('create denied'); expect(store.loading()).toBe(false);
        expect(store.projects()).toEqual([project('existing')]);
        const retry = query(); const retried = store.createProject({ name: 'new', parentProjectId: null });
        expect(store.error()).toBeNull();
        retry.resolve({ data: project('new'), error: null }); await retried;
        expect(store.projects().map(row => row.id)).toEqual(['existing', 'new']);
    });

    it('invalidates responses across logout and reauthentication as the same account', async () => {
        const old = query(); userId.set('A'); TestBed.tick();
        userId.set(null); TestBed.tick();
        const current = query(); userId.set('A'); TestBed.tick();
        await finish(current, [project('current')]);
        await finish(old, [project('obsolete')]);
        expect(store.projects()).toEqual([project('current')]);
    });

});

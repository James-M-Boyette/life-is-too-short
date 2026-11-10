/** Opt-in actual-store test, launched only by the disposable local harness. */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { TasksStore } from './tasks.store';
import { ProjectsStore } from '@/features/projects/state/projects.store';
import { TASK_SYNC_CONFIG, type TaskSyncConfig } from './task-sync.config';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';

const raw = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.['LITS_TASK_SYNC_LOCAL'];
const local = raw ? JSON.parse(raw) as { url: string; key: string; mode: TaskSyncConfig['mode'] } : null;

describe.runIf(local)('TasksStore actual disposable Supabase synchronization', () => {
    const clients: { removeAllChannels: () => Promise<unknown> }[] = [];
    afterEach(async () => {
        TestBed.resetTestingModule();
        for (const client of clients) await client.removeAllChannels();
        vi.restoreAllMocks();
    });
    it('uses the configured mode with real Auth, paginated reads, writes and account isolation', async () => {
        if (!local) throw new Error('Local-only test requires the isolated harness');
        // Validate before constructing any client. Never accept hosted endpoints.
        expect(local.url).toBe('http://127.0.0.1:56321');
        const make = () => {
            const value = createClient(local.url, local.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            clients.push(value); return value;
        };
        const a = make(), b = make();
        const signup = async (client: typeof a) => {
            const response = await client.auth.signUp({ email: `${crypto.randomUUID()}@sync.invalid`, password: `Local-${crypto.randomUUID()}!` });
            expect(response.error).toBeNull(); expect(response.data.session).toBeTruthy(); return response.data;
        };
        const ownerA = await signup(a), ownerB = await signup(b);
        const count = local.mode === 'broadcast' ? 1005 : 2;
        const seed = Array.from({ length: count }, () => ({ id: crypto.randomUUID(), user_id: ownerA.user!.id, title: 'Initial' }));
        for (let index = 0; index < count; index += 200) expect((await a.from('tasks').insert(seed.slice(index, index + 200))).error).toBeNull();
        const userId = signal<string | null>(ownerA.user!.id);
        const channel = vi.spyOn(a, 'channel');
        TestBed.configureTestingModule({ providers: [TasksStore,
            { provide: SUPABASE_CLIENT, useValue: a },
            { provide: AuthStore, useValue: { userId } },
            { provide: TASK_SYNC_CONFIG, useValue: { mode: local.mode, safetyRefreshMs: 120_000 } },
        ] });
        const store = TestBed.inject(TasksStore); TestBed.tick();
        await vi.waitFor(() => expect(store.tasks()).toHaveLength(count), { timeout: 15000 });
        if (local.mode === 'postgres-changes') {
            expect(channel).toHaveBeenCalledWith(`tasks:${ownerA.user!.id}`);
            await store.updateContent(store.tasks()[0], { title: 'Legacy write still works', description: null });
            expect(store.tasks()[0].title).toBe('Legacy write still works');
            // Baseline publication delivery is a previously known separate defect;
            // this is compatibility of initial reads and the existing write path.
        } else if (local.mode === 'broadcast') {
            expect(channel).toHaveBeenCalledWith(`task-invalidation:${ownerA.user!.id}`,
                expect.objectContaining({ config: expect.objectContaining({ private: true }) }));
            await vi.waitFor(() => expect(store.realtimeConnected()).toBe(true), { timeout: 15000 });
            const added = { id: crypto.randomUUID(), user_id: ownerA.user!.id, title: 'Broadcast insert' };
            expect((await a.from('tasks').insert(added)).error).toBeNull();
            await vi.waitFor(() => expect(store.tasks().find(task => task.id === added.id)?.title).toBe('Broadcast insert'), { timeout: 15000 });
            expect(store.lastInvalidationAt()).not.toBeNull();
            expect((await a.from('tasks').update({ title: 'Broadcast update' }).eq('id', added.id)).error).toBeNull();
            await vi.waitFor(() => expect(store.tasks().find(task => task.id === added.id)?.title).toBe('Broadcast update'), { timeout: 15000 });
            expect((await a.from('tasks').delete().eq('id', added.id)).error).toBeNull();
            await vi.waitFor(() => expect(store.tasks().some(task => task.id === added.id)).toBe(false), { timeout: 15000 });
            const foreign = { id: crypto.randomUUID(), user_id: ownerB.user!.id, title: 'B only' };
            expect((await b.from('tasks').insert(foreign)).error).toBeNull();
            await a.auth.setSession(ownerB.session!);
            userId.set(ownerB.user!.id); TestBed.tick();
            expect(store.tasks()).toEqual([]);
            await vi.waitFor(() => expect(store.tasks().map(task => task.id)).toEqual([foreign.id]), { timeout: 15000 });
            await vi.waitFor(() => expect(store.realtimeConnected()).toBe(true), { timeout: 15000 });
            expect(store.error()).toBeNull();
        } else {
            expect(local.mode).toBe('api-only'); expect(channel).not.toHaveBeenCalled();
            expect(store.realtimeConnected()).toBe(false);
            expect((await a.from('tasks').update({ title: 'Recovery API read' }).eq('id', seed[0].id)).error).toBeNull();
            await store.refreshTasks();
            expect(store.tasks().find(task => task.id === seed[0].id)?.title).toBe('Recovery API read');
            const projects = TestBed.inject(ProjectsStore); TestBed.tick();
            const parent = await projects.createProject({ name: 'API-only parent', parentProjectId: null });
            const child = await projects.createProject({ name: 'API-only child', parentProjectId: parent.id });
            await projects.updateProject({ projectId: child.id, name: 'Renamed child', parentProjectId: parent.id });
            await store.addTask({ title: 'API-only created', description: '**Draft**', projectId: parent.id });
            const created = store.tasks().find(task => task.title === 'API-only created')!;
            await store.updateContent(created, { title: 'API-only edited', description: '**Saved**' });
            await store.updatePlannedDate(created, '2026-11-10');
            await store.updateDueDate(created, '2026-11-11');
            await store.updateTaskPosition(created, 'project_position', 1234);
            await store.toggleDone(created);
            await store.updateProject(created, child.id);
            expect(store.tasks().find(task => task.id === created.id)).toMatchObject({
                title: 'API-only edited', description: '**Saved**', is_done: true,
                planned_date: '2026-11-10', due_date: '2026-11-11', project_id: child.id,
            });
            await projects.deleteProject(child.id); await store.refreshTasks();
            expect(store.tasks().find(task => task.id === created.id)?.project_id).toBeNull();
            await projects.deleteProject(parent.id);
            await store.remove(created.id);
            expect(store.tasks().some(task => task.id === created.id)).toBe(false);
            expect(channel).not.toHaveBeenCalled();
        }
        userId.set(null); TestBed.tick(); expect(store.tasks()).toEqual([]);
    }, 60000);
});

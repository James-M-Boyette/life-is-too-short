/** Opt-in Stage 3 integration; credentials and Docker target come from owned local harness. */
import { TestBed } from '@angular/core/testing';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { TasksStore } from './tasks.store';
import { TASK_SYNC_CONFIG } from './task-sync.config';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';

const raw = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.['LITS_TASK_SYNC_E2E'];
const local = raw ? JSON.parse(raw) as { url: string; key: string; project: string } : null;
describe.runIf(local)('Stage 3 actual multi-device task synchronization', () => {
    it('converges independent stores, isolates accounts, recovers failures and measures representative snapshots', async () => {
        if (!local) throw new Error('Requires disposable local harness');
        expect(local.url).toBe('http://127.0.0.1:56321'); expect(local.project).toMatch(/^lits-integration-[a-f0-9]{8}$/);
        // Node 22's built-in accessor keeps Node-only fixture types out of the
        // application's browser tsconfig; this branch runs only in local Vitest.
        const { execFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (name: string) => {
            execFileSync: (file: string, args: string[], options: { input: string; encoding: string }) => string;
        } } }).process.getBuiltinModule('child_process');
        const clients: { removeAllChannels: () => Promise<unknown> }[] = [];
        const injectors: EnvironmentInjector[] = [];
        const measurements: object[] = []; const checks: string[] = [];
        const sql = (statement: string) => execFileSync('docker', ['exec', '-i', `supabase_db_${local.project}`, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: statement, encoding: 'utf8' }).trim();
        const check = (name: string) => { checks.push(name); console.log(`STAGE3: ${name}`); };
        const ok = <T>(value: { data: T; error: unknown }) => { expect(value.error).toBeNull(); return value.data; };
        const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        const make = () => {
            const meter = { requests: 0, bytes: 0, active: 0, offline: false, hints: 0 };
            const client = createClient(local.url, local.key, {
                auth: { storageKey: crypto.randomUUID(), persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
                global: { fetch: async (input, init) => {
                    const url = String(input); const read = url.includes('/rest/v1/tasks') && (!init?.method || init.method === 'GET');
                    if (read) { meter.requests++; if (meter.offline) throw new TypeError('Injected local HTTP network failure'); meter.active++; }
                    try {
                        const response = await fetch(input, init);
                        if (read) meter.bytes += (await response.clone().arrayBuffer()).byteLength;
                        return response;
                    } finally { if (read) meter.active--; }
                } },
            }); clients.push(client); return { client, meter };
        };
        const a1 = make(), a2 = make(), b = make(), adversary = make();
        const password = `Local-${crypto.randomUUID()}!`, email = `${crypto.randomUUID()}@e2e.invalid`;
        const accountA = ok(await a1.client.auth.signUp({ email, password }));
        const sessionA2 = await a2.client.auth.signInWithPassword({ email, password });
        expect(sessionA2.error).toBeNull();
        expect(sessionA2.data.session?.refresh_token === accountA.session?.refresh_token).toBe(false);
        const accountB = ok(await b.client.auth.signUp({ email: `${crypto.randomUUID()}@e2e.invalid`, password }));
        expect(accountA.session).toBeTruthy(); expect(accountB.session).toBeTruthy();
        ok(await adversary.client.auth.setSession(accountB.session!));
        // Representative existing account data, before clients subscribe.
        ok(await a1.client.from('tasks').insert(Array.from({ length: 100 }, (_, index) => ({
            id: crypto.randomUUID(), user_id: accountA.user!.id, title: `Seed ${index}`, planned_position: (index + 1) * 1000,
        }))));
        TestBed.configureTestingModule({});
        const device = (source: typeof a1, owner: string) => {
            const user = signal<string | null>(owner);
            const injector = createEnvironmentInjector([TasksStore,
                { provide: AuthStore, useValue: { userId: user } },
                { provide: SUPABASE_CLIENT, useValue: source.client },
                { provide: TASK_SYNC_CONFIG, useValue: { mode: 'broadcast', safetyRefreshMs: 120_000 } },
            ], TestBed.inject(EnvironmentInjector));
            injectors.push(injector); const store = injector.get(TasksStore); TestBed.tick(); return { store, user };
        };
        const d1 = device(a1, accountA.user!.id), d2 = device(a2, accountA.user!.id), db = device(b, accountB.user!.id);
        const wait = (assertion: () => void, timeout = 45000) => vi.waitFor(assertion, { timeout, interval: 20 });
        const both = async (assertion: (store: TasksStore) => void) => {
            try { await wait(() => { assertion(d1.store); assertion(d2.store); }); }
            catch (error) {
                console.log('STAGE3_DIAGNOSTIC ' + JSON.stringify({
                    meters: [a1.meter, a2.meter],
                    stores: [d1.store, d2.store].map(store => ({ error: store.syncError(), connected: store.realtimeConnected(), lastRead: store.lastSyncedAt(), lastHint: store.lastInvalidationAt(), content: store.tasks().filter(task => task.title.startsWith('Cross-device')) })),
                    persisted: sql("SELECT coalesce(json_agg(t),'[]') FROM public.tasks t WHERE title LIKE 'Cross-device%';"),
                    messages: sql("SELECT count(*) FROM realtime.messages WHERE event='tasks_changed_v1';"),
                })); throw error;
            }
        };
        const rawEvents: unknown[] = [];
        try {
            await wait(() => { expect(d1.store.realtimeConnected()).toBe(true); expect(d2.store.realtimeConnected()).toBe(true); expect(db.store.realtimeConnected()).toBe(true); });
            for (const device of [a1, a2, b]) device.client.realtime.getChannels()[0].on('broadcast', { event: 'tasks_changed_v1' }, () => device.meter.hints++);
            const denied = adversary.client.channel(`task-invalidation:${accountA.user!.id}`, { config: { private: true } });
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Timeout is not authorization denial')), 15000);
                denied.subscribe((status, error) => {
                    if (status === 'SUBSCRIBED') { clearTimeout(timer); reject(new Error('Foreign join succeeded')); }
                    if (status === 'CHANNEL_ERROR' && /permission|authoriz/i.test(error?.message ?? '')) { clearTimeout(timer); resolve(); }
                });
            });
            await adversary.client.removeChannel(denied);
            // Separate client avoids SDK topic reuse between public/private channels.
            const rawClient = make(); ok(await rawClient.client.auth.setSession(accountB.session!));
            const rawFeed = rawClient.client.channel('adversarial-raw').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, event => rawEvents.push(event));
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Raw join timeout')), 15000);
                rawFeed.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } });
            });
            check('Independent A1/A2/B stores joined; adversarial B private-A join explicitly denied');
            const locate = () => d1.store.tasks().find(task => task.title.startsWith('Cross-device'))!;
            await d1.store.addTask({ title: 'Cross-device create', description: '**source**', projectId: null });
            const id = locate().id;
            await both(store => expect(store.tasks().find(task => task.id === id)?.description).toBe('**source**'));
            await d1.store.updateContent(locate(), { title: 'Cross-device edited', description: '- Markdown' });
            await both(store => expect(store.tasks().find(task => task.id === id)?.description).toBe('- Markdown'));
            await d1.store.toggleDone(locate()); await both(store => expect(store.tasks().find(task => task.id === id)?.is_done).toBe(true));
            await d1.store.updatePlannedDate(locate(), '2026-11-09');
            await d1.store.updateDueDate(locate(), '2026-11-10');
            try { await both(store => expect(store.tasks().find(task => task.id === id)).toMatchObject({ planned_date: '2026-11-09', due_date: '2026-11-10' })); }
            catch (error) {
                console.log('STAGE3_DEBUG ' + JSON.stringify({
                    a1: d1.store.tasks().find(task => task.id === id), a2: d2.store.tasks().find(task => task.id === id),
                    a1Error: d1.store.syncError(), a2Error: d2.store.syncError(), a1Connected: d1.store.realtimeConnected(), a2Connected: d2.store.realtimeConnected(),
                    meters: [a1.meter, a2.meter], persisted: sql(`SELECT row_to_json(t) FROM public.tasks t WHERE id='${id}';`),
                })); throw error;
            }
            const project = ok(await a1.client.from('projects').insert({ user_id: accountA.user!.id, name: 'E2E project' }).select().single());
            await d1.store.updateProject(locate(), project.id); await both(store => expect(store.tasks().find(task => task.id === id)?.project_id).toBe(project.id));
            ok(await a1.client.rpc('delete_project', { p_project_id: project.id }));
            await both(store => expect(store.tasks().find(task => task.id === id)?.project_id).toBeNull());
            await d1.store.remove(id); await both(store => expect(store.tasks().some(task => task.id === id)).toBe(false));
            check('Cross-device stable-ID INSERT/content/completion/planned/due/project/delete_project/DELETE convergence');
            const ids = d1.store.tasks().slice(0, 25).map(task => task.id);
            const beforeBulk = { a1: a1.meter.requests, a2: a2.meter.requests }, bulkStarted = performance.now();
            await Promise.all(ids.map((id, index) => a1.client.from('tasks').update({ planned_position: 900000 + index }).eq('id', id).then(ok)));
            await both(store => ids.forEach((id, index) => expect(store.tasks().find(task => task.id === id)?.planned_position).toBe(900000 + index)));
            measurements.push({ bulkRows: 25, elapsedMs: Math.round(performance.now() - bulkStarted), a1Requests: a1.meter.requests - beforeBulk.a1, a2Requests: a2.meter.requests - beforeBulk.a2 });
            const duplicates = { a1: a1.meter.requests, a2: a2.meter.requests, hints1: a1.meter.hints, hints2: a2.meter.hints };
            sql(`SELECT realtime.send('{"v":1}'::jsonb,'tasks_changed_v1','task-invalidation:${accountA.user!.id}',true) FROM generate_series(1,100);`);
            await wait(() => { expect(a1.meter.hints).toBeGreaterThanOrEqual(duplicates.hints1 + 100); expect(a2.meter.hints).toBeGreaterThanOrEqual(duplicates.hints2 + 100); });
            await both(store => expect(store.lastSyncedAt()!).toBeGreaterThanOrEqual(store.lastInvalidationAt()!));
            measurements.push({ duplicateHints: 100, a1Requests: a1.meter.requests - duplicates.a1, a2Requests: a2.meter.requests - duplicates.a2 });
            const target = ids[0];
            a2.meter.offline = true;
            ok(await a1.client.from('tasks').update({ title: 'During HTTP outage' }).eq('id', target));
            await wait(() => expect(d2.store.syncError()).toContain('failed'));
            a2.meter.offline = false; window.dispatchEvent(new Event('online'));
            await both(store => expect(store.tasks().find(task => task.id === target)?.title).toBe('During HTTP outage'));
            // Close the real underlying socket unexpectedly, leaving SDK retry ownership intact.
            a2.client.realtime.conn?.close(4000, 'Local test transport loss');
            await wait(() => expect(d2.store.realtimeConnected()).toBe(false));
            ok(await a1.client.from('tasks').update({ title: 'Missed while disconnected' }).eq('id', target));
            await wait(() => expect(d2.store.realtimeConnected()).toBe(true));
            await both(store => expect(store.tasks().find(task => task.id === target)?.title).toBe('Missed while disconnected'));
            ok(await a1.client.from('tasks').update({ title: 'After SDK rejoin' }).eq('id', target));
            await both(store => expect(store.tasks().find(task => task.id === target)?.title).toBe('After SDK rejoin'));
            check('Injected HTTP outage/online recovery and real unexpected websocket close/SDK rejoin/catch-up/subsequent delivery');
            let seeded = 100;
            for (const count of [100, 1000, 5000]) {
                visible.mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
                await wait(() => expect(a1.meter.active + a2.meter.active).toBe(0));
                for (let index = seeded; index < count; index += 200) {
                    ok(await a1.client.from('tasks').insert(Array.from({ length: Math.min(200, count - index) }, (_, offset) => ({
                        id: crypto.randomUUID(), user_id: accountA.user!.id, title: `Seed ${index + offset}`, planned_position: (index + offset + 1) * 1000,
                    }))));
                }
                seeded = count;
                const before = { requests: a1.meter.requests, bytes: a1.meter.bytes }, started = performance.now();
                await d1.store.refreshTasks();
                const sample = { tasks: count, requests: a1.meter.requests - before.requests, bytes: a1.meter.bytes - before.bytes, elapsedMs: Math.round(performance.now() - started) };
                expect(sample.requests).toBe(Math.ceil(count / 500) + 1); expect(d1.store.tasks()).toHaveLength(count); measurements.push(sample);
                visible.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
                await both(store => expect(store.tasks()).toHaveLength(count));
            }
            check('100/1000/5000 task snapshots measured; both devices converge after each workload');
            // Cancel scheduled reads, finish old reads, then lose an actual send.
            visible.mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
            await wait(() => expect(a1.meter.active + a2.meter.active).toBe(0));
            const beforeMessages = sql("SELECT count(*) FROM realtime.messages WHERE event='tasks_changed_v1';");
            sql('REVOKE INSERT(id,payload,event,topic,private,extension) ON realtime.messages FROM task_notification_sender;');
            try { ok(await a1.client.from('tasks').update({ title: 'Lost notification' }).eq('id', target)); }
            finally { sql('GRANT INSERT(id,payload,event,topic,private,extension) ON realtime.messages TO task_notification_sender;'); }
            expect(sql("SELECT count(*) FROM realtime.messages WHERE event='tasks_changed_v1';")).toBe(beforeMessages);
            expect(d2.store.tasks().find(task => task.id === target)?.title).toBe('After SDK rejoin');
            const recoveryStarted = performance.now(), beforeSafety = { a1: a1.meter.requests, a2: a2.meter.requests };
            visible.mockReturnValue('visible'); // No resume event: recovery must come from the actual 120s safety tick.
            await wait(() => {
                expect(d1.store.tasks().find(task => task.id === target)?.title).toBe('Lost notification');
                expect(d2.store.tasks().find(task => task.id === target)?.title).toBe('Lost notification');
            }, 130000);
            measurements.push({ safetyRecoveryMs: Math.round(performance.now() - recoveryStarted), intervalMs: 120000, a1Requests: a1.meter.requests - beforeSafety.a1, a2Requests: a2.meter.requests - beforeSafety.a2 });
            check('Real denied-send mutation persisted without a message; both devices recovered on actual safety ticks');
            expect(db.store.tasks()).toEqual([]); expect(db.store.lastInvalidationAt()).toBeNull(); expect(rawEvents).toEqual([]);
            check('B store received no A task content or private hints; adversarial raw observer received no DELETE IDs/events');
            d2.user.set(null); TestBed.tick(); expect(d2.store.tasks()).toEqual([]);
            console.log('LITS_STAGE3_RESULT ' + JSON.stringify({ checks, measurements, retainedJwt: 'Server proof separately verifies JWT validity until expiry; store logout prevents obsolete application updates.' }));
        } finally {
            injectors.forEach(injector => injector.destroy());
            for (const client of clients) await client.removeAllChannels();
            TestBed.resetTestingModule(); vi.restoreAllMocks();
        }
    }, 300000);
});

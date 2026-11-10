import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksStore } from './tasks.store';
import { TASK_SYNC_CONFIG } from './task-sync.config';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import { AuthStore } from '@/shared/supabase/auth.store';
import type { Task } from '../models/tasks.model';

function deferred<T>() {
    let resolve!: (value: T) => void, reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
type Page = { data: Task[] | null; error: Error | null };
const row = (id = '1', title = 'Task', owner = 'A') => ({
    id, title, user_id: owner, description: null, project_id: null,
    status: 'todo', is_done: false, planned_date: null, due_date: null, due_at: null,
    project_position: 1000, planned_position: 1000,
    created_at: '2026-11-09T00:00:00Z', updated_at: '2026-11-09T00:00:00Z',
}) as Task;

describe('TasksStore private Broadcast synchronization', () => {
    let store: TasksStore;
    let user: ReturnType<typeof signal<string | null>>;
    let pages: ReturnType<typeof deferred<Page>>[];
    let channels: { topic: string; options: unknown; event: string; filter: unknown;
        notify: (message: unknown) => void; status: (value: string) => void }[];
    let removeChannel: ReturnType<typeof vi.fn>;
    let update: ReturnType<typeof vi.fn>;
    let single: ReturnType<typeof vi.fn>;
    let signals: AbortSignal[];
    let online: ReturnType<typeof vi.spyOn>;
    let visible: ReturnType<typeof vi.spyOn>;
    const flush = () => vi.advanceTimersByTimeAsync(0);
    const advance = (ms = 150) => vi.advanceTimersByTimeAsync(ms);
    async function empty(index: number) { pages[index].resolve({ data: [], error: null }); await flush(); }
    async function snapshot(index: number, rows: Task[]) {
        pages[index].resolve({ data: rows, error: null }); await flush();
        if (rows.length) await empty(index + 1);
    }
    const notify = () => channels.at(-1)!.notify({ payload: { v: 1, id: 'message-not-task' } });

    beforeEach(async () => {
        vi.useFakeTimers(); vi.setSystemTime(10000);
        online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        user = signal<string | null>('A'); pages = []; channels = []; signals = [];
        removeChannel = vi.fn().mockResolvedValue('ok'); single = vi.fn(); update = vi.fn();
        const query = {
            select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
            abortSignal: vi.fn(signal => { signals.push(signal); return query; }),
            limit: vi.fn(() => { const page = deferred<Page>(); pages.push(page); return page.promise; }),
            update, eq: vi.fn().mockReturnThis(), single,
        };
        update.mockReturnValue(query);
        TestBed.configureTestingModule({ providers: [TasksStore,
            { provide: AuthStore, useValue: { userId: user } },
            { provide: TASK_SYNC_CONFIG, useValue: { mode: 'broadcast', safetyRefreshMs: 120_000 } },
            { provide: SUPABASE_CLIENT, useValue: {
                from: vi.fn().mockReturnValue(query), removeChannel,
                channel: vi.fn((topic, options) => {
                    const captured = { topic, options, event: '', filter: {}, notify: (_: unknown) => {}, status: (_: string) => {} };
                    channels.push(captured);
                    const channel = {
                        on: vi.fn((event, filter, callback) => { captured.event = event; captured.filter = filter; captured.notify = callback; return channel; }),
                        subscribe: vi.fn(callback => { captured.status = callback; return channel; }),
                    }; return channel;
                }),
            } },
        ] });
        store = TestBed.inject(TasksStore); TestBed.tick();
        await empty(0);
    });
    afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); });

    it('closes the initial fetch/join race and distinguishes join, hints and authoritative data', async () => {
        expect(channels[0]).toMatchObject({ topic: 'task-invalidation:A', options: { config: { private: true } }, event: 'broadcast', filter: { event: 'tasks_changed_v1' } });
        const initialRead = store.lastSyncedAt();
        await advance(10); channels[0].status('SUBSCRIBED'); await flush();
        expect(store.realtimeConnected()).toBe(true); expect(store.lastSyncedAt()).toBe(initialRead);
        expect(store.loading()).toBe(false); expect(store.lastInvalidationAt()).toBeNull();
        await snapshot(1, [row('1', 'Created between fetch and join')]);
        expect(store.tasks()[0].title).toBe('Created between fetch and join');
        expect(store.lastSyncedAt()).toBeGreaterThan(initialRead!);
        channels[0].notify({ payload: { v: 2 } }); await advance(); expect(pages).toHaveLength(3);
    });

    it('retains a join and invalidation occurring while the initial foreground fetch is still pending', async () => {
        user.set('B'); TestBed.tick();
        channels[1].status('SUBSCRIBED'); notify(); await advance();
        expect(pages).toHaveLength(2); // Only the new account initial read is active.
        await snapshot(1, [row('1', 'Before join', 'B')]);
        await advance(); await snapshot(3, [row('1', 'After join', 'B')]);
        expect(store.tasks()[0].title).toBe('After join');
    });

    it('supports explicit API-only rollback without raw or private subscriptions', async () => {
        TestBed.inject(TASK_SYNC_CONFIG).mode = 'api-only';
        user.set('B'); TestBed.tick(); await empty(1);
        expect(channels).toHaveLength(1); expect(store.realtimeConnected()).toBe(false);
        await advance(120_000); await advance(); await snapshot(2, [row('1', 'Recovery mode', 'B')]);
        expect(store.tasks()[0].title).toBe('Recovery mode'); expect(store.lastInvalidationAt()).toBeNull();
    });

    it('recovers complete API-only snapshots on resume/online and isolates late account responses', async () => {
        TestBed.inject(TASK_SYNC_CONFIG).mode = 'api-only';
        user.set('B'); TestBed.tick(); await empty(1);
        online.mockReturnValue(false); window.dispatchEvent(new Event('offline'));
        await advance(120_000); expect(pages).toHaveLength(2);
        online.mockReturnValue(true); visible.mockReturnValue('hidden'); window.dispatchEvent(new Event('online'));
        await advance(); expect(pages).toHaveLength(2);
        visible.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); await flush();
        const firstPage = Array.from({ length: 500 }, (_, i) => row(String(i).padStart(4, '0'), 'B task', 'B'));
        pages[2].resolve({ data: firstPage, error: null }); await flush();
        expect(store.tasks()).toEqual([]); // Partial snapshots are never published.
        await snapshot(3, [row('0500', 'Last page', 'B')]);
        expect(store.tasks()).toHaveLength(501);
        window.dispatchEvent(new Event('pageshow')); await flush();
        const oldPage = pages.at(-1)!;
        user.set('C'); TestBed.tick(); expect(store.tasks()).toEqual([]);
        await snapshot(pages.length - 1, [row('C-task', 'C only', 'C')]);
        oldPage.resolve({ data: firstPage, error: null }); await flush();
        expect(store.tasks().map(task => task.user_id)).toEqual(['C']);
        expect(store.error()).toBeNull(); expect(store.syncError()).toBeNull();
        expect(channels).toHaveLength(1); // Only the original Broadcast fixture, never B/C.
        user.set(null); TestBed.tick(); const count = pages.length;
        await advance(120_000); window.dispatchEvent(new Event('pageshow')); await flush();
        expect(pages).toHaveLength(count); expect(store.tasks()).toEqual([]);
    });

    it('coalesces duplicate/burst hints without trusting row content or executing mutations', async () => {
        for (let i = 0; i < 100; i++) channels[0].notify({ payload: { v: 1, title: 'Not authoritative', id: 'fake task' } });
        expect(store.tasks()).toEqual([]); expect(pages).toHaveLength(1);
        await advance(149); expect(pages).toHaveLength(1);
        await advance(1); expect(pages).toHaveLength(2); expect(update).not.toHaveBeenCalled();
        await empty(1); await advance(1000); expect(pages).toHaveLength(2);
    });

    it('releases a permanently stalled background snapshot and rejects its late partial results', async () => {
        store.tasks.set([row('1', 'Keep visible')]);
        notify(); await advance();
        await advance(30_000);
        expect(store.syncError()).toContain('timed out');
        await advance(1000); expect(pages).toHaveLength(3);
        await snapshot(2, [row('1', 'Recovered')]);
        pages[1].resolve({ data: [row('1', 'Obsolete timeout response')], error: null }); await flush();
        expect(store.tasks()[0].title).toBe('Recovered'); expect(store.loading()).toBe(false);
    });

    it('times out a later page atomically and passes one cancellation signal through all pages', async () => {
        store.tasks.set([row('1', 'Original')]); notify(); await advance();
        pages[1].resolve({ data: [row('1', 'Partial')], error: null }); await flush();
        expect(signals[0]).toBe(signals[1]);
        await advance(30_000); expect(signals[0].aborted).toBe(true);
        expect(store.tasks()[0].title).toBe('Original');
        await advance(1000); await snapshot(3, [row('1', 'Full retry')]);
        pages[2].resolve({ data: [], error: null }); await flush();
        expect(store.tasks()[0].title).toBe('Full retry');
    });

    it('bounds repeated never-settling requests without a safety tick resetting the retry budget', async () => {
        TestBed.inject(TASK_SYNC_CONFIG).safetyRefreshMs = 0;
        user.set('B'); TestBed.tick(); await empty(1);
        notify(); await advance();
        for (let attempt = 0; attempt < 4; attempt++) {
            await advance(30_000);
            expect(signals.at(-1)!.aborted).toBe(true);
            if (attempt < 3) await advance([1000, 5000, 15000][attempt]);
        }
        const count = pages.length;
        notify(); await advance(300_000); expect(pages).toHaveLength(count);
        window.dispatchEvent(new Event('online')); await flush(); await empty(count);
        expect(store.syncError()).toBeNull();
    });

    it('bounds continuous debounce and preserves dirty work during a paginated refresh', async () => {
        for (let i = 0; i < 11; i++) { notify(); await advance(90); }
        expect(pages).toHaveLength(1); await advance(10); expect(pages).toHaveLength(2);
        pages[1].resolve({ data: [row()], error: null }); await flush();
        expect(pages).toHaveLength(3); notify();
        await empty(2); await advance(); expect(pages).toHaveLength(4);
        await snapshot(3, [row('1', 'Latest')]); expect(store.tasks()[0].title).toBe('Latest');
    });

    it('waits for pending mutation settlement then coalesces the protected catch-up', async () => {
        const task = row(); store.tasks.set([task]);
        const saving = deferred<{ data: { title: string; description: null }; error: null }>();
        single.mockReturnValueOnce(saving.promise);
        const operation = store.updateContent(task, { title: 'Optimistic', description: null }); await flush();
        notify(); await advance(); await snapshot(1, [task]);
        expect(store.tasks()[0].title).toBe('Optimistic');
        // A hung local save must not block new invalidations for other tasks.
        notify(); await advance(); await snapshot(3, [task, row('2', 'Remote task')]);
        expect(store.tasks().find(task => task.id === '2')?.title).toBe('Remote task');
        expect(store.tasks()[0].title).toBe('Optimistic');
        const count = pages.length; await advance(1000); expect(pages).toHaveLength(count);
        saving.resolve({ data: { title: 'Optimistic', description: null }, error: null }); await operation;
        await advance(); expect(pages).toHaveLength(count + 1);
        await snapshot(count, [row('1', 'Final server row')]);
        expect(store.tasks()[0].title).toBe('Final server row'); expect(update).toHaveBeenCalledTimes(1);
    });

    it('preserves earlier visible data on later-page failure without clobbering task-action errors or spinners', async () => {
        const task = row(); store.tasks.set([task]); store.error.set('Keep mutation failure');
        notify(); await advance();
        pages[1].resolve({ data: [row('1', 'Stale partial')], error: null }); await flush();
        pages[2].reject(new Error('Page two offline')); await flush();
        expect(store.tasks()).toEqual([task]); expect(store.loading()).toBe(false);
        expect(store.error()).toBe('Keep mutation failure'); expect(store.syncError()).toContain('Page two offline');
        await advance(1000); await snapshot(3, [row('1', 'Recovered')]);
        expect(store.syncError()).toBeNull(); expect(store.error()).toBe('Keep mutation failure');
    });

    it('limits refresh retries and leaves subsequent recovery to explicit triggers or the safety interval', async () => {
        notify(); await advance();
        for (const [index, delay] of [[1, 1000], [2, 5000], [3, 15000]] as const) {
            pages[index].reject(new Error('Offline')); await flush(); await advance(delay);
        }
        pages[4].reject(new Error('Still offline')); await flush();
        for (let i = 0; i < 10; i++) notify();
        await advance(20000); expect(pages).toHaveLength(5);
        window.dispatchEvent(new Event('online')); await flush(); expect(pages).toHaveLength(6);
        await empty(5); expect(store.syncError()).toBeNull();
    });

    it('uses SDK reconnect status to catch up missed create, update and delete without resubscribing itself', async () => {
        store.tasks.set([row('1', 'Deleted remotely'), row('2', 'Old')]);
        for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
            channels[0].status(status); expect(store.realtimeConnected()).toBe(false);
        }
        expect(store.syncError()).toContain('connection unavailable');
        notify(); await advance(); await snapshot(1, store.tasks());
        expect(store.syncError()).toContain('connection unavailable'); // An API read does not repair a broken channel.
        channels[0].status('SUBSCRIBED'); await flush();
        await snapshot(3, [row('2', 'Updated'), row('3', 'Created')]);
        expect(store.tasks().map(task => task.title)).toEqual(['Updated', 'Created']);
        expect(channels).toHaveLength(1); expect(store.syncError()).toBeNull();
    });

    it('pauses offline/hidden work and catches up on online and mobile foreground recovery', async () => {
        online.mockReturnValue(false); window.dispatchEvent(new Event('offline'));
        notify(); await advance(120_000); expect(pages).toHaveLength(1);
        online.mockReturnValue(true); visible.mockReturnValue('hidden'); window.dispatchEvent(new Event('online'));
        await advance(); expect(pages).toHaveLength(1);
        visible.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
        await flush(); await empty(1);
        window.dispatchEvent(new Event('pageshow')); await flush(); expect(pages).toHaveLength(3);
        await empty(2);
    });

    it('performs a modest safety read despite an apparently joined socket and no hints', async () => {
        channels[0].status('SUBSCRIBED'); await flush(); await empty(1);
        expect(store.lastInvalidationAt()).toBeNull();
        await advance(120_000); await advance(); expect(pages).toHaveLength(3);
        await snapshot(2, [row('1', 'Missed notification recovered')]);
        expect(store.tasks()[0].title).toBe('Missed notification recovered');
    });

    it('rejects obsolete callbacks and pending responses across direct account switch and delayed teardown', async () => {
        const closing = deferred<string>(); removeChannel.mockReturnValueOnce(closing.promise);
        notify(); await advance(); const old = channels[0];
        user.set('B'); TestBed.tick(); expect(store.tasks()).toEqual([]);
        expect(signals[0].aborted).toBe(true);
        const bPage = pages.length - 1; await snapshot(bPage, [row('1', 'B only', 'B')]);
        old.notify({ payload: { v: 1 } }); old.status('SUBSCRIBED'); old.status('CHANNEL_ERROR');
        pages[1].resolve({ data: [row('1', 'A late')], error: null }); await flush();
        closing.resolve('ok'); await flush(); await advance(1000);
        expect(store.tasks()[0].user_id).toBe('B'); expect(store.error()).toBeNull(); expect(store.syncError()).toBeNull();
        expect(channels).toHaveLength(2); expect(channels[1].topic).toBe('task-invalidation:B');
        user.set(null); TestBed.tick(); const count = pages.length;
        channels[1].notify({ payload: { v: 1 } }); await advance(180_000);
        expect(pages).toHaveLength(count); expect(store.tasks()).toEqual([]); expect(store.lastSyncedAt()).toBeNull();
    });

    it('lets a foreground refresh supersede a background snapshot without leaving a spinner or losing dirty work', async () => {
        notify(); await advance(); const foreground = store.refreshTasks();
        await snapshot(2, [row('1', 'Manual refresh')]); await foreground;
        expect(signals[0].aborted).toBe(true); // The obsolete HTTP promise need never settle.
        expect(store.tasks()[0].title).toBe('Manual refresh'); expect(store.loading()).toBe(false);
        await advance(); await snapshot(4, [row('1', 'Caught up')]);
        expect(store.tasks()[0].title).toBe('Caught up');
    });
});

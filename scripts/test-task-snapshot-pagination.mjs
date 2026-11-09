/** Disposable local API contract check; never reads hosted/application credentials. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { prepare, sql, localCli, work, project, owned, root } from './test-local-supabase-services.mjs';

assert(!process.argv.includes('--workdir'), 'Always create a new disposable pagination environment');
const report = { checks: [], environment: {}, scope: 'Real SDK/Data API pagination contract, not an instantiated Angular TasksStore' };
const clients = [];
function ok(response) {
    if (response.error) throw new Error(`Local API ${response.error.code}: ${response.error.message}`);
    return response.data;
}
function pass(name, detail = {}) { report.checks.push({ name, ...detail }); console.log(`PASS: ${name}`); }
async function snapshot(client, betweenPages) {
    const rows = []; let cursor; let pages = 0;
    for (;;) {
        let query = client.from('tasks').select('*').order('id', { ascending: true });
        if (cursor !== undefined) query = query.gt('id', cursor);
        const data = ok(await query.limit(500)); pages++;
        assert(Array.isArray(data));
        if (!data.length) break;
        for (const row of data) {
            assert(cursor === undefined || row.id > cursor);
            cursor = row.id; rows.push(row);
        }
        await betweenPages?.(pages);
    }
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    return { rows, pages };
}
try {
    prepare();
    for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql'))) {
        const source = path.join(root, 'supabase/migrations', name);
        const target = path.join(work, 'supabase/migrations', name);
        fs.copyFileSync(source, target); assert(fs.readFileSync(source).equals(fs.readFileSync(target)));
    }
    localCli(['migration', 'up', '--local']);
    const status = JSON.parse(localCli(['status', '-o', 'json']));
    assert.equal(status.API_URL, 'http://127.0.0.1:56321');
    assert.match(fs.readFileSync(path.join(work, 'supabase/config.toml'), 'utf8'), /max_rows = 1000/);
    report.environment = { project, work: path.relative(root, work), database: sql('SHOW server_version;'), cli: localCli(['--version']).trim(), apiMaxRows: 1000 };
    const client = () => {
        const value = createClient(status.API_URL, status.ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }); clients.push(value); return value;
    };
    const a = client(), b = client();
    const signup = async value => {
        const result = ok(await value.auth.signUp({ email: `${randomUUID()}@pagination.invalid`, password: `Local-${randomUUID()}!` }));
        assert(result.session); return result.user.id;
    };
    const aid = await signup(a), bid = await signup(b);
    const inserted = Array.from({ length: 1205 }, () => ({ id: randomUUID(), user_id: aid, title: 'Pagination fixture' }));
    for (let index = 0; index < inserted.length; index += 200) ok(await a.from('tasks').insert(inserted.slice(index, index + 200)));
    ok(await b.from('tasks').insert({ id: randomUUID(), user_id: bid, title: 'Foreign fixture' }));
    const single = ok(await a.from('tasks').select('*').order('id', { ascending: true }).limit(2000));
    assert.equal(single.length, 1000);
    pass('Real API caps a single SELECT at 1000 despite a request for 2000');
    const complete = await snapshot(a);
    assert.equal(complete.rows.length, 1205); assert.equal(complete.pages, 4);
    assert.deepEqual(complete.rows.map(row => row.id), inserted.map(row => row.id).sort());
    assert(complete.rows.every(row => row.user_id === aid));
    pass('Keyset pages retrieve all 1205 unique owner rows with an empty terminal page', { pages: complete.pages, rows: complete.rows.length });
    const bSnapshot = await snapshot(b); assert.equal(bSnapshot.rows.length, 1);
    assert(bSnapshot.rows.every(row => row.user_id === bid));
    pass('RLS limits each authenticated account snapshot to its own rows');
    // Delete an already-read low-ID row between pages. Offset 500 would skip
    // the next row; an immutable ID cursor still retrieves every later row.
    const removedId = complete.rows[0].id;
    const duringDelete = await snapshot(a, async page => {
        if (page === 1) ok(await a.from('tasks').delete().eq('id', removedId));
    });
    assert.deepEqual(duringDelete.rows.map(row => row.id), complete.rows.map(row => row.id));
    const next = await snapshot(a); assert.equal(next.rows.length, 1204);
    assert(!next.rows.some(row => row.id === removedId));
    pass('Concurrent earlier-row deletion causes no keyset skip; next refresh removes the already-read row');
    assert.equal(sql("SELECT count(*) FROM pg_publication_tables WHERE schemaname='public' AND tablename='tasks';"), '0');
    assert.equal(sql("SELECT relreplident FROM pg_class WHERE oid='public.tasks'::regclass;"), 'd');
    pass('Tasks publication and replica identity remain unchanged');
} catch (error) {
    report.failure = error.message; process.exitCode = 1; console.error(error.message);
} finally {
    for (const value of clients) await value.removeAllChannels();
    report.result = report.failure ? 'failed' : 'passed';
    fs.writeFileSync(path.join(root, 'documentation/verification/task-snapshot-pagination-results.json'), JSON.stringify(report, null, 2) + '\n');
    if (owned) localCli(['stop', '--no-backup']);
}

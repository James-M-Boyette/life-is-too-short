/** Local-only Supabase service integration. No environment/hosted credentials read.
 * node scripts/test-local-supabase-services.mjs --installation-only [--full-chain-start]
 * Full-services diagnostics remain available separately (without installation-only).
 * Uses the installed CLI and SDK. Creates a new stack unless an owned test
 * workspace is supplied; never adopts the application's existing local stack.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
const supplied = process.argv.indexOf('--workdir');
const installationOnly = process.argv.includes('--installation-only');
const fullChainStart = process.argv.includes('--full-chain-start');
assert(!process.argv.includes('--ownership-experiment'), 'Historical experiment retired; checked-in SQL is now tested unchanged');
assert(!fullChainStart || (installationOnly && supplied < 0), 'Full-chain startup requires a fresh installation-only workspace');
const work = supplied < 0 ? path.join(root, 'tmp', `supabase-services-${randomUUID()}`)
  : path.resolve(root, process.argv[supplied + 1]);
assert(work.startsWith(path.join(root, 'tmp') + path.sep));
const report = { gate: installationOnly ? 'installation-and-api' : 'full-services', fullChainStart, checks: [], defects: [], experiments: [], environment: {} };
const clients = [];
const channels = [];
const success = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS: ${name}`); };
const defect = (name, detail) => { report.defects.push({ name, detail }); console.log(`DEFECT: ${name}`); };
const command = (exe, args, input) => spawnSync(exe, args, {
  cwd: root, input, encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024,
});
function localCli(args) {
  // All callers use only fixed local commands; no link, push or hosted URL option.
  const result = command(process.execPath, [cli, ...args, '--workdir', work]);
  if (result.status !== 0) {
    fs.writeFileSync(path.join(work, `${args[0]}-failure.log`), result.stdout + result.stderr);
    throw new Error(`Local CLI ${args[0]} failed; see owned workspace logs`);
  }
  return result.stdout;
}
let project;
let owned = false;
function sql(statement) {
  assert(project.startsWith('lits-integration-'));
  const result = command('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-XqAt',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], statement);
  if (result.status !== 0) throw new Error(`Local SQL failed: ${result.stderr?.slice(0, 500)}`);
  return result.stdout.trim();
}
function prepare() {
  if (supplied < 0) {
    fs.mkdirSync(path.join(work, 'supabase/migrations'), { recursive: true });
    project = `lits-integration-${randomUUID().slice(0, 8)}`;
    const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
      .replace('project_id = "life-is-too-short"', `project_id = "${project}"`)
      .replace(/543(\d\d)/g, '563$1').replace('sql_paths = ["./seed.sql"]', 'sql_paths = []');
    fs.writeFileSync(path.join(work, 'supabase/config.toml'), config);
    fs.writeFileSync(path.join(work, 'integration-owned.json'), JSON.stringify({ project }));
    for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql') && (fullChainStart || n.startsWith('202610')))) {
      fs.copyFileSync(path.join(root, 'supabase/migrations', name), path.join(work, 'supabase/migrations', name));
    }
  } else {
    project = JSON.parse(fs.readFileSync(path.join(work, 'integration-owned.json'), 'utf8')).project;
  }
  assert(/^lits-integration-[a-f0-9]{8}$/.test(project));
  assert(fs.readFileSync(path.join(work, 'supabase/config.toml'), 'utf8').includes(`project_id = "${project}"`));
  assert(!fs.existsSync(path.join(work, 'supabase/.temp/project-ref')), 'Never use a linked workspace');
  owned = true;
  report.environment.project = project;
  if (supplied < 0) {
    const started = command(process.execPath, [cli, 'start', '--workdir', work, '--exclude',
      'studio,postgres-meta,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor']);
    fs.writeFileSync(path.join(work, 'start.log'), started.stdout + started.stderr);
    assert.equal(started.status, 0, 'Disposable CLI stack start failed; see ignored start.log');
  }
}
function ok(response) {
  if (response.error) throw new Error(`API failure ${response.error.code}: ${response.error.message}`);
  return response.data;
}
function denied(response, codes = ['42501']) {
  assert(response.error, 'Expected database/API denial');
  assert(codes.includes(response.error.code), `Unexpected denial code ${response.error.code}`);
}
async function eventually(check, milliseconds = 12000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return false;
}
async function subscription(client, owner, events, unfiltered = false) {
  // removeChannel resolves before the SDK WebSocket close completes. Wait for
  // the public lifecycle state rather than racing a new join against closing.
  assert(await eventually(() => !client.realtime.isDisconnecting(), 2000));
  let postgresStatus;
  const channel = client.channel(`integration-${randomUUID()}`).on('system', {}, message => {
    report.experiments.push({ name: 'Realtime system status', message });
    if (message.extension === 'postgres_changes') postgresStatus = message.status;
  }).on('postgres_changes', {
    event: '*', schema: 'public', table: 'tasks', ...(unfiltered ? {} : { filter: `user_id=eq.${owner}` }),
  }, event => events.push(event));
  channels.push([client, channel]);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 15000);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error(`Realtime channel error: ${error?.message}`)); }
    });
  });
  await eventually(() => postgresStatus !== undefined, 15000);
  return channel;
}
async function main() {
  prepare();
  const status = JSON.parse(localCli(['status', '-o', 'json']));
  const url = new URL(status.API_URL);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '56321');
  const client = () => {
    const value = createClient(url.href, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    clients.push(value); return value;
  };
  const a = client(), b = client(), anon = client();
  const password = `LocalOnly-${randomUUID()}!`;
  const emailA = `a-${randomUUID()}@integration.invalid`;
  const emailB = `b-${randomUUID()}@integration.invalid`;
  const signup = async (c, email) => ok(await c.auth.signUp({ email, password }));
  const authA = await signup(a, emailA), authB = await signup(b, emailB);
  assert(authA.session && authB.session, 'Disposable auth must allow non-confirmed local email signup');
  const ownerA = authA.user.id, ownerB = authB.user.id;
  ok(await a.auth.signInWithPassword({ email: emailA, password }));
  ok(await a.auth.refreshSession());
  success(fullChainStart ? 'GoTrue signup password login and session refresh after fresh-chain startup'
    : 'GoTrue signup password login and session refresh before migration');
  report.environment.images = command('docker', ['ps', '--filter', `name=${project}`, '--format', '{{.Names}} {{.Image}}']).stdout.trim().split('\n');
  report.environment.database = sql('SHOW server_version;');
  report.environment.publicationBefore = sql("SELECT schemaname||'.'||tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';");
  report.environment.replicaIdentityBefore = sql("SELECT relreplident FROM pg_class WHERE oid='public.tasks'::regclass;");
  report.environment.role = sql("SELECT current_user, rolsuper, rolcreaterole FROM pg_roles WHERE rolname=current_user;");
  assert.equal(sql('SELECT NOT rolsuper FROM pg_roles WHERE rolname=current_user;'), 't');

  // Apply immutable checked-in migrations in order while live services and sessions exist.
  for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.startsWith('20261109')).sort()) {
    const source = path.join(root, 'supabase/migrations', name);
    const target = path.join(work, 'supabase/migrations', name);
    fs.copyFileSync(source, target);
    assert(fs.readFileSync(source).equals(fs.readFileSync(target)));
    try { localCli(['migration', 'up', '--local']); success(`CLI ${fullChainStart ? 'confirms recorded migration' : 'migration'} ${name}`); }
    catch (error) {
      const log = fs.readFileSync(path.join(work, 'migration-failure.log'), 'utf8');
      const detail = log.split('\n').find(line => line.includes('MigrationApplyError'));
      defect(`Migration installation failed: ${name}`, detail || error.message); throw error;
    }
  }
  report.environment.helperMembership = sql("SELECT pg_get_userbyid(grantor),admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='project_hierarchy_checker'::regrole;");
  // PG17 CREATEROLE can retain an ADMIN-only creator membership. What must be
  // removed after installation is SET/inherited object authority, not ADMIN.
  assert.equal(sql("SELECT pg_has_role('postgres','project_hierarchy_checker','SET');"), 'f');
  assert.equal(sql("SELECT pg_has_role('postgres','project_hierarchy_checker','USAGE');"), 'f');
  const migrationNames = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
  for (const name of migrationNames) {
    assert(fs.readFileSync(path.join(root, 'supabase/migrations', name))
      .equals(fs.readFileSync(path.join(work, 'supabase/migrations', name))));
  }
  const installed = sql('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;').split('\n');
  assert.deepEqual(installed, migrationNames.map(name => name.split('_')[0]));
  report.environment.migrations = migrationNames.map(name => ({ name,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'supabase/migrations', name))).digest('hex'),
  }));
  report.environment.recordedVersions = installed;
  success('Complete checked-in migration chain recorded by CLI; copies are byte-identical');
  const functionSecurity = JSON.parse(sql(`SELECT json_build_object(
    'owner', pg_get_userbyid(proowner), 'volatile', provolatile, 'securityDefiner', prosecdef,
    'configuration', proconfig) FROM pg_proc
    WHERE oid='project_hierarchy_private.enforce_acyclic_projects()'::regprocedure;`));
  assert.equal(functionSecurity.owner, 'project_hierarchy_checker');
  assert.equal(functionSecurity.volatile, 'v');
  assert.equal(functionSecurity.securityDefiner, true);
  assert(functionSecurity.configuration.includes('search_path=""'));
  assert(functionSecurity.configuration.includes('row_security=on'));
  report.environment.functionSecurity = functionSecurity;
  assert.equal(sql("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb FROM pg_roles WHERE rolname='project_hierarchy_checker';"), 't');
  const roleCapabilities = {};
  for (const role of ['anon', 'authenticated', 'service_role']) {
    roleCapabilities[role] = {};
    for (const capability of ['MEMBER', 'SET', 'USAGE']) {
      const granted = sql(`SELECT pg_has_role('${role}','project_hierarchy_checker','${capability}');`);
      assert.equal(granted, 'f'); roleCapabilities[role][capability] = false;
    }
    assert.equal(sql(`SELECT has_schema_privilege('${role}','project_hierarchy_private','USAGE');`), 'f');
    assert.equal(sql(`SELECT has_function_privilege('${role}','project_hierarchy_private.enforce_acyclic_projects()','EXECUTE');`), 'f');
  }
  report.environment.apiHelperCapabilities = roleCapabilities;
  for (const column of ['id', 'user_id', 'parent_project_id']) {
    assert.equal(sql(`SELECT has_column_privilege('project_hierarchy_checker','public.projects','${column}','SELECT');`), 't');
  }
  assert.equal(sql("SELECT has_column_privilege('project_hierarchy_checker','public.projects','name','SELECT');"), 'f');
  assert.equal(sql("SELECT has_table_privilege('project_hierarchy_checker','public.projects','UPDATE');"), 'f');
  for (const privilege of ['SELECT', 'INSERT']) {
    assert.equal(sql(`SELECT has_table_privilege('project_hierarchy_checker','project_hierarchy_private.account_guards','${privilege}');`), 't');
  }
  assert.equal(sql("SELECT has_column_privilege('project_hierarchy_checker','project_hierarchy_private.account_guards','revision','UPDATE');"), 't');
  assert.equal(sql("SELECT has_table_privilege('project_hierarchy_checker','project_hierarchy_private.account_guards','DELETE');"), 'f');
  assert.equal(sql("SELECT has_schema_privilege('project_hierarchy_checker','project_hierarchy_private','CREATE');"), 'f');
  success('Dedicated helper ownership, function hardening and minimal grants preserved');
  success('API roles have no helper membership, SET or inheritance; migration SET and inheritance revoked');
  // No service restart before exercising cached schema and existing access tokens.
  const projectRow = async (c, owner, name, parent = null) => ok(await c.from('projects')
    .insert({ user_id: owner, name, parent_project_id: parent }).select('*').single());
  const parent = await projectRow(a, ownerA, 'Parent');
  const child = await projectRow(a, ownerA, 'Child', parent.id);
  const grandchild = await projectRow(a, ownerA, 'Grandchild', child.id);
  ok(await a.from('projects').update({ name: 'Renamed', parent_project_id: null }).eq('id', child.id).select('*').single());
  ok(await a.from('projects').update({ name: 'Renamed', parent_project_id: parent.id }).eq('id', child.id).select('*').single());
  denied(await a.from('projects').update({ parent_project_id: grandchild.id }).eq('id', parent.id), ['23514']);
  denied(await a.from('projects').update({ parent_project_id: parent.id }).eq('id', parent.id), ['23514']);
  success('Project create rename reparent root and cycle rejection over Data API');
  const taskRow = async (c, owner, title, projectId = null) => ok(await c.from('tasks').insert({
    id: randomUUID(), user_id: owner, title, description: '**Markdown**', project_id: projectId,
    planned_date: '2026-11-09', project_position: 1000, planned_position: 1000,
  }).select('*').single());
  const task = await taskRow(a, ownerA, 'Atomic content', parent.id);
  ok(await a.from('tasks').update({ title: 'Edited', description: '- one\n- two' }).eq('id', task.id).eq('user_id', ownerA).select('title, description').single());
  ok(await a.from('tasks').update({ is_done: true, status: 'done' }).eq('id', task.id).eq('user_id', ownerA).select('*').single());
  ok(await a.from('tasks').update({ planned_date: '2026-11-10', planned_position: 1500, due_date: '2026-11-11' }).eq('id', task.id).eq('user_id', ownerA).select('*').single());
  ok(await a.from('tasks').update({ project_id: child.id, project_position: 2000 }).eq('id', task.id).eq('user_id', ownerA).select('*').single());
  const read = ok(await a.from('tasks').select('*').eq('id', task.id).single());
  assert.equal(read.title, 'Edited'); assert.equal(read.is_done, true); assert.equal(read.planned_position, 1500);
  assert.equal(read.due_date, '2026-11-11'); assert.equal(read.project_id, child.id);
  assert(Date.parse(read.updated_at) >= Date.parse(read.created_at));
  success('Angular SDK contracts: task create read atomic content completion scheduling order assignment');
  const foreign = await projectRow(b, ownerB, 'Foreign');
  const foreignTask = await taskRow(b, ownerB, 'FOREIGN SECRET', foreign.id);
  for (const [table, id] of [['tasks', foreignTask.id], ['projects', foreign.id]]) {
    assert.deepEqual(ok(await a.from(table).select('*').eq('id', id)), []);
    const field = table === 'tasks' ? { title: 'intrusion' } : { name: 'intrusion' };
    assert.deepEqual(ok(await a.from(table).update(field).eq('id', id).select('*')), []);
    for (const query of [anon.from(table).select('*'), anon.from(table).update(field).eq('id', id), anon.from(table).delete().eq('id', id)]) denied(await query);
  }
  denied(await anon.from('tasks').insert({ user_id: ownerA, title: 'denied' }));
  denied(await anon.from('projects').insert({ user_id: ownerA, name: 'denied' }));
  denied(await a.schema('project_hierarchy_private').from('account_guards').select('*'), ['PGRST106', '42501']);
  assert.deepEqual(ok(await a.from('tasks').delete().eq('id', foreignTask.id).select('*')), []);
  denied(await a.from('projects').delete().eq('id', foreign.id));
  denied(await a.from('projects').delete().eq('id', parent.id));
  denied(await a.from('projects').update({ parent_project_id: foreign.id }).eq('id', child.id), ['23503']);
  denied(await a.from('tasks').update({ user_id: ownerB }).eq('id', task.id));
  const rpcDenied = await a.rpc('delete_project', { p_project_id: foreign.id });
  denied(rpcDenied, ['P0001']);
  denied(await anon.rpc('delete_project', { p_project_id: parent.id }), ['42501', 'PGRST202']);
  success('Two real Auth accounts and anon: RLS ownership and direct project DELETE denial');
  const direct = await taskRow(a, ownerA, 'Direct task', parent.id);
  const nested = await taskRow(a, ownerA, 'Grandchild task', grandchild.id);
  ok(await a.rpc('delete_project', { p_project_id: parent.id }));
  assert.equal(ok(await a.from('tasks').select('*').eq('id', direct.id).single()).project_id, null);
  assert.equal(ok(await a.from('projects').select('*').eq('id', child.id).single()).parent_project_id, null);
  assert.equal(ok(await a.from('projects').select('*').eq('id', grandchild.id).single()).parent_project_id, child.id);
  assert.equal(ok(await a.from('tasks').select('*').eq('id', nested.id).single()).project_id, grandchild.id);
  success('delete_project real RPC preserves direct tasks children and grandchildren');

  // Future function probes intentionally separate explicit-grant behavior from defaults.
  sql("CREATE FUNCTION public.integration_closed() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$; CREATE FUNCTION public.integration_open() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$; GRANT EXECUTE ON FUNCTION public.integration_open() TO authenticated; NOTIFY pgrst, 'reload schema';");
  const closedPrivilege = sql("SELECT has_function_privilege('authenticated','public.integration_closed()','EXECUTE');");
  if (closedPrivilege !== 'f') defect('Future function unexpectedly executable', 'Local platform grants override closed defaults');
  assert.equal(sql("SELECT has_function_privilege('anon','public.integration_open()','EXECUTE');"), 'f');
  // Poll the schema reload as an external async state transition, not a fixed delay.
  let opened;
  const end = Date.now() + 10000;
  do { opened = await a.rpc('integration_open'); if (!opened.error) break; await new Promise(r => setTimeout(r, 100)); } while (Date.now() < end);
  assert.equal(ok(opened), 2);
  const closedCall = await a.rpc('integration_closed');
  if (closedCall.error) denied(closedCall, ['42501', 'PGRST202']);
  else defect('Future closed function reachable over RPC', 'Explicit deny-by-default is not effective in this stack');
  denied(await anon.rpc('integration_open'), ['42501', 'PGRST202']);
  success('Explicit future function grant and schema-cache reload work', { closedPrivilege });

  if (!installationOnly) {
    const realtime = async (label, a = clients[0], b = clients[1]) => {
      const eventsA = [], eventsB = [], unfiltered = [];
      const ca = await subscription(a, ownerA, eventsA);
      const cb = await subscription(b, ownerB, eventsB);
      const cu = await subscription(a, ownerA, unfiltered, true);
      const probeA = await taskRow(a, ownerA, `${label} A`);
      const probeB = await taskRow(b, ownerB, `${label} B SECRET`);
      const inserted = await eventually(() => eventsA.some(e => e.eventType === 'INSERT' && e.new.id === probeA.id)
        && eventsB.some(e => e.eventType === 'INSERT' && e.new.id === probeB.id));
      report.experiments.push({ label, insertObservation: {
        ownerA: eventsA.map(e => ({ event: e.eventType, id: e.new?.id })),
        ownerB: eventsB.map(e => ({ event: e.eventType, id: e.new?.id })),
        unfiltered: unfiltered.map(e => ({ event: e.eventType, id: e.new?.id })),
      } });
      if (!inserted) {
        defect(`${label}: task INSERT events missing`, 'Subscriptions joined, but own-account INSERT did not arrive within 12 seconds');
      } else {
        ok(await a.from('tasks').update({ title: `${label} updated` }).eq('id', probeA.id));
        assert(await eventually(() => eventsA.some(e => e.eventType === 'UPDATE' && e.new.id === probeA.id)));
        ok(await b.from('tasks').delete().eq('id', probeB.id));
        ok(await a.from('tasks').delete().eq('id', probeA.id));
        const removed = await eventually(() => eventsA.some(e => e.eventType === 'DELETE' && e.old.id === probeA.id));
        if (!removed) defect(`${label}: app-filtered DELETE missing`, 'user_id filter with current replica identity did not deliver own DELETE');
        const unfilteredDelete = unfiltered.find(e => e.eventType === 'DELETE' && e.old.id === probeA.id);
        const foreignDelete = unfiltered.find(e => e.eventType === 'DELETE' && e.old.id === probeB.id);
        report.experiments.push({ label, inserted, filteredDelete: removed, unfilteredDelete: !!unfilteredDelete,
          deleteFields: unfilteredDelete ? Object.keys(unfilteredDelete.old) : [],
          foreignDeleteDelivered: !!foreignDelete, foreignDeleteFields: foreignDelete ? Object.keys(foreignDelete.old) : [],
          foreignDeleteOnAppFilter: eventsA.some(e => e.eventType === 'DELETE' && e.old.id === probeB.id) });
        assert(![...eventsA, ...unfiltered].some(e => e.new?.id === probeB.id || e.new?.title?.includes('B SECRET')));
        assert(![...eventsA, ...unfiltered].some(e => e.old?.id === probeB.id
          && (e.old?.title?.includes('B SECRET') || e.old?.description)));
        success(`${label}: authorized INSERT UPDATE; foreign INSERT content not delivered`, { filteredDelete: removed });
        // Test a fresh connection after migrations and token refresh.
        await a.removeChannel(ca);
        const reconnect = [];
        const cr = await subscription(a, ownerA, reconnect);
        const marker = await taskRow(a, ownerA, 'Reconnect marker');
        assert(await eventually(() => reconnect.some(e => e.new?.id === marker.id)));
        await a.removeChannel(cr);
        success(`${label}: Realtime resubscription receives current account events`);
      }
      await a.removeChannel(ca); await b.removeChannel(cb); await a.removeChannel(cu);
      return inserted;
    };
    await realtime('Checked-in migrations');
    const published = sql("SELECT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tasks');");
    if (published === 'f') {
      report.experiments.push({ name: 'Disposable-only publication diagnostic', sql: 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks' });
      sql('ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;');
      const hotPublication = await realtime('Publication experiment');
      if (!hotPublication) {
        report.experiments.push({ name: 'Disposable-only Realtime restart and fresh authenticated clients after publication change' });
        assert.equal(command('docker', ['restart', `supabase_realtime_${project}`]).status, 0);
        assert(await eventually(() => command('docker', ['inspect', '--format', '{{.State.Health.Status}}',
          `supabase_realtime_${project}`]).stdout.trim() === 'healthy', 30000));
        const freshA = client(), freshB = client();
        for (const [oldClient, freshClient] of [[a, freshA], [b, freshB]]) {
          const session = ok(await oldClient.auth.getSession()).session;
          ok(await freshClient.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }));
        }
        await realtime('Publication plus Realtime restart experiment', freshA, freshB);
      }
    }
    if (report.experiments.some(e => e.filteredDelete === false)) {
      report.experiments.push({ name: 'Disposable-only replica identity diagnostic', sql: 'ALTER TABLE public.tasks REPLICA IDENTITY FULL' });
      sql('ALTER TABLE public.tasks REPLICA IDENTITY FULL;');
      await realtime('Replica identity FULL experiment');
    }
  } else {
    report.environment.publicationAfter = sql("SELECT schemaname||'.'||tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';");
    report.environment.replicaIdentityAfter = sql("SELECT relreplident FROM pg_class WHERE oid='public.tasks'::regclass;");
    assert.equal(report.environment.publicationAfter, report.environment.publicationBefore);
    assert.equal(report.environment.replicaIdentityAfter, report.environment.replicaIdentityBefore);
    report.notTested = ['Realtime publication, replica identity, event delivery, metadata exposure and subscription lifecycle'];
  }
  ok(await a.from('tasks').delete().eq('user_id', ownerA));
  ok(await a.auth.refreshSession());
  const revokedRefreshToken = ok(await a.auth.getSession()).session.refresh_token;
  ok(await a.auth.signOut());
  assert.equal(ok(await a.auth.getSession()).session, null);
  denied(await a.from('tasks').select('*'));
  assert((await client().auth.refreshSession({ refresh_token: revokedRefreshToken })).error,
    'Signed-out session refresh token must be revoked by GoTrue');
  ok(await a.auth.signInWithPassword({ email: emailA, password }));
  assert.equal(ok(await a.auth.getUser()).user.id, ownerA);
  success('Post-migration session refresh logout anonymous fallback and login');
  sql('DROP FUNCTION public.integration_open(); DROP FUNCTION public.integration_closed();');
}
try { await main(); }
catch (error) {
  report.failure = error.message;
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const [client, channel] of channels) await client.removeChannel(channel).catch(() => {});
  for (const client of clients) await client.removeAllChannels().catch(() => {});
  fs.mkdirSync(path.join(root, 'documentation/verification'), { recursive: true });
  const suffix = installationOnly ? (fullChainStart ? 'fresh-installation' : 'installation') : 'current';
  report.result = report.failure ? 'failed' : report.defects.length ? 'blocked-with-conditional-results' : 'passed';
  if (report.defects.length) process.exitCode = 1;
  fs.writeFileSync(path.join(root, `documentation/verification/local-supabase-services-${suffix}-results.json`), JSON.stringify(report, null, 2) + '\n');
  // No stop/reset in shared directories. Only this manifest-verified project.
  if (owned && !process.argv.includes('--keep-stack')) {
    try { localCli(['stop', '--no-backup']); console.log('Stopped disposable integration stack'); }
    catch { console.error('Disposable stack cleanup failed; use its owned --workdir to stop it'); }
  }
}

/** Disposable LOCAL Supabase cutover rehearsal; never adopt an existing database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepare, sql, localCli, root, work, project, owned, command } from './test-local-supabase-services.mjs';

assert(!process.argv.includes('--workdir'), 'Never adopt an existing stack');
process.env.DO_NOT_TRACK = '1';
process.env.SUPABASE_TELEMETRY_DISABLED = '1';
const removal = '20261109050000_remove_raw_task_publication.sql';
const broadcast = '20261109060000_add_private_task_broadcast.sql';
const source = fs.readFileSync(path.join(root, 'supabase/migrations', removal), 'utf8');
const report = { checks: [], environment: {}, limitations: [
    'Local native services/PG17.11 are not hosted PG17.6 or proof of its publication ownership.',
    'No hosted credentials, consumers, client builds or native configuration were inspected.',
    'Synthetic fixtures do not establish physical-device or arbitrary administrator-DDL behavior.',
] };
const check = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS: ${name}`); };
const snapshot = () => sql(`SELECT json_build_object(
  'publications',(SELECT json_agg(p ORDER BY oid) FROM pg_publication p),
  'members',(SELECT json_agg(r ORDER BY oid) FROM pg_publication_rel r),
  'schemas',(SELECT json_agg(n ORDER BY oid) FROM pg_publication_namespace n));`);
const run = (file, args, env = {}) => {
    const result = spawnSync(process.execPath, [file, ...args], {
        cwd: root, encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, ...env },
    });
    return result;
};
let beforeContainers, beforeVolumes;
try {
    beforeContainers = command('docker', ['ps', '--format', '{{.ID}} {{.Names}}']).stdout.trim().split('\n').sort();
    beforeVolumes = command('docker', ['volume', 'ls', '-q']).stdout.trim().split('\n');
    prepare();
    assert(/^lits-integration-[a-f0-9]{8}$/.test(project));
    report.environment = { project, database: sql('SHOW server_version;'), cli: localCli(['--version']).trim(),
        role: sql('SELECT current_user,rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user;') };
    report.environment.images = command('docker', ['ps','--filter',`name=${project}`,'--format','{{.Names}} {{.Image}}']).stdout.trim().split('\n');
    assert.equal(sql('SELECT NOT rolsuper FROM pg_roles WHERE rolname=current_user;'), 't');
    for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n < removal && n.endsWith('.sql'))) {
        fs.copyFileSync(path.join(root, 'supabase/migrations', name), path.join(work, 'supabase/migrations', name));
    }
    localCli(['migration', 'up', '--local']);
    const status = JSON.parse(localCli(['status', '-o', 'json']));
    assert.equal(status.API_URL, 'http://127.0.0.1:56321');
    function actualStore(stage) {
        const result = run(path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
            ['test', '--watch=false', '--include=src/app/features/tasks/state/tasks-sync.local.spec.ts'],
            { LITS_TASK_SYNC_LOCAL: JSON.stringify({ url: status.API_URL, key: status.ANON_KEY, mode: 'api-only' }) });
        fs.writeFileSync(path.join(work, `${stage}-angular.log`), (result.stdout ?? '') + (result.stderr ?? ''));
        assert.equal(result.status, 0, `Actual API-only TasksStore failed at ${stage}; inspect ignored local log`);
        assert.match(result.stdout, /1 passed/);
        check(`Actual Angular API-only store: ${stage}`);
    }
    // Fresh installations normally have no task publication; unchanged migration is a no-op.
    assert.equal(sql("SELECT count(*) FROM pg_publication_tables WHERE schemaname='public' AND tablename='tasks';"), '0');
    const fresh = snapshot(); sql(source); assert.equal(snapshot(), fresh);
    check('Fresh no-membership migration is a safe no-op');
    report.environment.publicationOwner = sql("SELECT pg_get_userbyid(pubowner) FROM pg_publication WHERE pubname='supabase_realtime';");
    sql('CREATE TABLE public.cutover_unrelated(id uuid PRIMARY KEY); ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks, public.cutover_unrelated; CREATE PUBLICATION cutover_unrelated_publication FOR TABLE public.cutover_unrelated;');
    actualStore('before-removal');
    sql(fs.readFileSync(path.join(root, 'documentation/verification/task-publication-cutover-preflight.sql'), 'utf8'));
    check('Complete bounded preflight SQL executes against real local catalogs (results are not hosted evidence)');
    const expected = snapshot();
    sql('CREATE PUBLICATION cutover_unexpected FOR TABLE public.tasks;');
    const unexpected = snapshot(); assert.throws(() => sql(source), /Unexpected raw tasks publication topology/);
    assert.equal(snapshot(), unexpected); sql('DROP PUBLICATION cutover_unexpected;');
    assert.equal(snapshot(), expected); check('Unexpected additional task publication aborts atomically');

    // ALL TABLES / schema publications need a superuser. Use only this owned local cluster.
    function admin(statement) {
        const result = command('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], statement);
        assert.equal(result.status, 0, 'Local fixture-admin operation unavailable; inspect compatibility');
        return result.stdout.trim();
    }
    admin('CREATE PUBLICATION cutover_all_tables FOR ALL TABLES;');
    const allTables = snapshot(); assert.throws(() => sql(source), /Unexpected raw tasks publication topology/);
    assert.equal(snapshot(), allTables); admin('DROP PUBLICATION cutover_all_tables;');
    admin('CREATE PUBLICATION cutover_schema FOR TABLES IN SCHEMA public;');
    const schema = snapshot(); assert.throws(() => sql(source), /Unexpected raw tasks publication topology/);
    assert.equal(snapshot(), schema); admin('DROP PUBLICATION cutover_schema;');
    check('ALL TABLES and public-schema publication coverage each abort atomically');

    sql('ALTER PUBLICATION supabase_realtime DROP TABLE public.tasks; ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks WHERE (is_done = false);');
    const filtered = snapshot(); assert.throws(() => sql(source), /Unexpected filtered/);
    assert.equal(snapshot(), filtered);
    sql('ALTER PUBLICATION supabase_realtime DROP TABLE public.tasks; ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks (id,user_id);');
    const columns = snapshot(); assert.throws(() => sql(source), /Unexpected filtered/);
    assert.equal(snapshot(), columns);
    sql('ALTER PUBLICATION supabase_realtime DROP TABLE public.tasks; ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;');
    check('Row-filtered and column-limited membership each abort atomically');

    // A trusted fixture admin changes ownership for a negative test only.
    admin('CREATE ROLE cutover_fixture_owner NOLOGIN; ALTER PUBLICATION supabase_realtime OWNER TO cutover_fixture_owner;');
    const foreignOwner = snapshot(); assert.throws(() => sql(source), /lacks publication-owner privileges/);
    assert.equal(snapshot(), foreignOwner);
    admin('ALTER PUBLICATION supabase_realtime OWNER TO postgres; DROP ROLE cutover_fixture_owner;');
    check('Non-superuser table owner cannot remove membership owned by an unavailable publication role');
    const otherBefore = sql("SELECT json_agg(p ORDER BY pubname,tablename) FROM (SELECT * FROM pg_publication_tables WHERE NOT (pubname='supabase_realtime' AND schemaname='public' AND tablename='tasks')) p;");
    const optionsBefore = sql('SELECT json_agg(p ORDER BY oid) FROM pg_publication p;');
    const identity = sql("SELECT relreplident FROM pg_class WHERE oid='public.tasks'::regclass;");
    fs.copyFileSync(path.join(root, 'supabase/migrations', removal), path.join(work, 'supabase/migrations', removal));
    localCli(['migration', 'up', '--local']);
    assert.equal(sql("SELECT count(*) FROM pg_publication_tables WHERE schemaname='public' AND tablename='tasks';"), '0');
    assert.equal(sql("SELECT json_agg(p ORDER BY pubname,tablename) FROM (SELECT * FROM pg_publication_tables WHERE NOT (pubname='supabase_realtime' AND schemaname='public' AND tablename='tasks')) p;"), otherBefore);
    assert.equal(sql('SELECT json_agg(p ORDER BY oid) FROM pg_publication p;'), optionsBefore);
    assert.equal(sql("SELECT relreplident FROM pg_class WHERE oid='public.tasks'::regclass;"), identity);
    const rerun = snapshot(); sql(source); assert.equal(snapshot(), rerun);
    assert.equal(sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261109050000';"), '1');
    check('CLI records removal; unrelated publications/members/options and replica identity preserved; retry is a no-op');
    actualStore('after-removal-before-broadcast');
    const proofFile = path.join(work, 'broadcast-proof.json');
    const proof = run(path.join(root, 'scripts/test-private-broadcast-proof.mjs'), ['--workdir', work, '--keep-stack', '--report-file', proofFile]);
    fs.writeFileSync(path.join(work, 'broadcast-proof.log'), (proof.stdout ?? '') + (proof.stderr ?? ''));
    assert.equal(proof.status, 0, 'Unchanged #75/proof failed; inspect ignored local proof report');
    const evidence = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
    assert.equal(evidence.result, 'passed');
    report.broadcastProof = { result: evidence.result, groups: evidence.checks.length };
    check('Unchanged #75 installed by CLI; complete owner/adversarial/API/RPC proof passed', report.broadcastProof);
    const messagesBeforeFault = sql('SELECT count(*) FROM realtime.messages;');
    sql('REVOKE INSERT (id,payload,event,topic,private,extension) ON realtime.messages FROM task_notification_sender;');
    try {
        actualStore('after-broadcast-api-only-recovery');
        assert.equal(sql('SELECT count(*) FROM realtime.messages;'), messagesBeforeFault, 'Fault must prevent notification storage while actual stores persist/reconcile');
        check('Actual API-only task/project operations recover with sender notifications unavailable');
    } finally {
        sql('GRANT INSERT (id,payload,event,topic,private,extension) ON realtime.messages TO task_notification_sender;');
    }
    report.environment.migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort().map(name => ({ name, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'supabase/migrations', name))).digest('hex') }));
    report.environment.recordedVersions = sql('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;').split('\n');
    assert.deepEqual(report.environment.recordedVersions, report.environment.migrations.map(m => m.name.split('_')[0]));
    report.result = 'passed';
} catch (error) {
    report.result = 'blocked'; report.failure = error.message; process.exitCode = 1; console.error(error.message);
} finally {
    if (owned) {
        try { localCli(['stop', '--no-backup']); report.disposableRemoved = true; }
        catch { report.disposableRemoved = false; process.exitCode = 1; }
    }
    if (beforeContainers) assert.deepEqual(command('docker', ['ps', '--format', '{{.ID}} {{.Names}}']).stdout.trim().split('\n').sort(), beforeContainers);
    if (beforeVolumes) assert(beforeVolumes.every(v => command('docker', ['volume', 'ls', '-q']).stdout.trim().split('\n').includes(v)));
    report.existingDevelopmentResourcesPreserved = true;
    fs.writeFileSync(path.join(root, 'documentation/verification/task-publication-cutover-results.json'), JSON.stringify(report, null, 2) + '\n');
}

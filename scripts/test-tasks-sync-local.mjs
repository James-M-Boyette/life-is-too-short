/** Actual Angular TasksStore against a newly owned loopback Supabase stack only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepare, localCli, root, work, project, owned } from './test-local-supabase-services.mjs';

assert(!process.argv.includes('--workdir'), 'Never adopt an existing database for this test');
const report = { checks: [], environment: {} };
try {
    prepare();
    const status = JSON.parse(localCli(['status', '-o', 'json']));
    assert.equal(status.API_URL, 'http://127.0.0.1:56321');
    report.environment = { project, work: path.relative(root, work), cli: localCli(['--version']).trim() };
    function test(mode) {
        const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@angular/cli/bin/ng.js'),
            'test', '--watch=false', '--include=src/app/features/tasks/state/tasks-sync.local.spec.ts'], {
            cwd: root, encoding: 'utf8', timeout: 180000,
            env: { ...process.env, LITS_TASK_SYNC_LOCAL: JSON.stringify({ url: status.API_URL, key: status.ANON_KEY, mode }) },
        });
        fs.writeFileSync(path.join(work, `${mode}-angular.log`), (result.stdout ?? '') + (result.stderr ?? ''));
        assert.equal(result.status, 0, `Actual TasksStore ${mode} failed; inspect owned workspace log`);
        assert.match(result.stdout, /1 passed/, 'Opt-in test must actually execute, not skip');
        report.checks.push({ mode, result: 'passed' }); console.log(`PASS: actual TasksStore ${mode}`);
    }
    // Production fallback before the Broadcast migration is installed.
    test('postgres-changes');
    for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql'))) {
        const source = path.join(root, 'supabase/migrations', name), target = path.join(work, 'supabase/migrations', name);
        fs.copyFileSync(source, target); assert(fs.readFileSync(source).equals(fs.readFileSync(target)));
    }
    localCli(['migration', 'up', '--local']);
    test('broadcast');
    test('api-only');
} catch (error) {
    report.failure = error.message; process.exitCode = 1; console.error(error.message);
} finally {
    report.result = report.failure ? 'failed' : 'passed';
    fs.writeFileSync(path.join(root, 'documentation/verification/tasks-broadcast-sync-local-results.json'), JSON.stringify(report, null, 2) + '\n');
    if (owned) localCli(['stop', '--no-backup']);
}

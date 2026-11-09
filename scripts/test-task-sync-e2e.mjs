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
            'test', '--watch=false', '--include=src/app/features/tasks/state/tasks-sync-e2e.local.spec.ts'], {
            cwd: root, encoding: 'utf8', timeout: 360000,
            env: { ...process.env, LITS_TASK_SYNC_E2E: JSON.stringify({ url: status.API_URL, key: status.ANON_KEY, project }) },
        });
        fs.writeFileSync(path.join(work, `${mode}-angular.log`), (result.stdout ?? '') + (result.stderr ?? ''));
        if (result.status !== 0) {
            const logs = spawnSync('docker', ['logs', '--tail', '200', `supabase_realtime_${project}`], { encoding: 'utf8' });
            fs.writeFileSync(path.join(work, 'realtime-failure.log'), (logs.stdout ?? '') + (logs.stderr ?? ''));
        }
        assert.equal(result.status, 0, `Actual TasksStore ${mode} failed; inspect owned workspace log`);
        assert.match(result.stdout, /1 passed/, 'Opt-in test must actually execute, not skip');
        const match = result.stdout.match(/LITS_STAGE3_RESULT (\{[^\r\n]+\})/);
        assert(match, 'Measurements must be emitted by actual-store test');
        report.evidence = JSON.parse(match[1]);
        report.checks.push({ mode, result: 'passed' }); console.log('PASS: actual multi-device Stage 3');
    }

    for (const name of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql'))) {
        const source = path.join(root, 'supabase/migrations', name), target = path.join(work, 'supabase/migrations', name);
        fs.copyFileSync(source, target); assert(fs.readFileSync(source).equals(fs.readFileSync(target)));
    }
    localCli(['migration', 'up', '--local']);
    test('broadcast');

} catch (error) {
    report.failure = error.message; process.exitCode = 1; console.error(error.message);
} finally {
    if (owned) {
        const logs = spawnSync('docker', ['logs', '--tail', '1000', `supabase_realtime_${project}`], { encoding: 'utf8' });
        const text = (logs.stdout ?? '') + (logs.stderr ?? '');
        report.serviceObservations = { messageRateLimitErrors: (text.match(/MessagePerSecondRateLimitReached/g) ?? []).length };
        fs.writeFileSync(path.join(work, 'realtime-observation.log'), text);
    }
    report.result = report.failure ? 'failed' : 'passed';
    fs.writeFileSync(path.join(root, 'documentation/verification/task-sync-e2e-results.json'), JSON.stringify(report, null, 2) + '\n');
    if (owned) localCli(['stop', '--no-backup']);
}

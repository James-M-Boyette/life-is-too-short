"""Disposable PostgreSQL 17 tests. No host ports, network, URLs, or app secrets.

Uses only Python's standard library, Docker, and psql inside the local image.
Run: python scripts/test-project-hierarchy-db.py --report <optional-json-path>
"""
import argparse
import concurrent.futures
import json
import pathlib
import subprocess
import time
import tomllib
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20261109020000_enforce_project_hierarchy_integrity.sql'
OWNER = str(uuid.UUID(int=1))
OTHER = str(uuid.UUID(int=2))


def ident(number):
    return str(uuid.UUID(int=100 + number))


class SqlError(Exception):
    def __init__(self, state, output):
        super().__init__(f'{state}: {output}')
        self.state = state


class Connection:
    def __init__(self, lab, database='hierarchy', role=None, owner=OWNER):
        self.process = subprocess.Popen(
            ['docker', 'exec', '-i', lab.container, 'psql', '-XqAt', '-U',
             'authenticator' if role in ('authenticated', 'anon', 'service_role') else 'postgres', '-d', database],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding='utf-8', bufsize=1,
        )
        self.execute('SET statement_timeout = \'15s\'')
        self.execute('SET lock_timeout = \'10s\'')
        if role not in ('authenticated', 'anon', 'service_role'):
            self.execute('SET deadlock_timeout = \'100ms\'')
        self.pid = int(self.execute('SELECT pg_backend_pid()')[0])
        if role:
            assert role in ('authenticated', 'anon', 'service_role', 'project_hierarchy_checker')
            self.execute(f'SET ROLE {role}')
            self.execute(f"SELECT set_config('request.jwt.claim.sub', '{owner}', false)")

    def execute(self, sql):
        marker = '__DONE_' + uuid.uuid4().hex
        self.process.stdin.write(sql.rstrip(';') + ';\n' + f'\\echo {marker} :SQLSTATE\n')
        self.process.stdin.flush()
        lines = []
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError(f'psql exited unexpectedly: {lines}')
            line = line.rstrip('\n')
            if line.startswith(marker):
                state = line.split()[-1]
                if state != '00000':
                    raise SqlError(state, '\n'.join(lines))
                return lines
            if line:
                lines.append(line)

    def scalar(self, sql):
        return self.execute(sql)[-1]

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.write('\\q\n')
            self.process.stdin.flush()
            self.process.wait(timeout=20)


class Lab:
    def __init__(self, image):
        self.container = 'litshierarchy-' + uuid.uuid4().hex[:12]
        self.connections = []
        self.results = []
        self.image = image

    def docker(self, *args, input=None, check=True):
        return subprocess.run(['docker', *args], input=input, text=True, encoding='utf-8',
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=check)

    def start(self):
        command = "mkdir -p /tmp/hierarchy-data; chown postgres:postgres /tmp/hierarchy-data; runuser -u postgres -- initdb -D /tmp/hierarchy-data -A trust -U postgres >/tmp/init.log && exec runuser -u postgres -- postgres -D /tmp/hierarchy-data -c listen_addresses='' -c unix_socket_directories=/tmp -c deadlock_timeout=100ms"
        self.docker('run', '--detach', '--rm', '--network', 'none', '--name', self.container,
                    '--label', 'life-is-too-short.disposable=hierarchy', '--env', 'PGHOST=/tmp',
                    '--entrypoint', '/bin/sh', self.image, '-c', command)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            # Readiness polling, not a timing assumption about concurrent schedules.
            if self.docker('exec', self.container, 'pg_isready', '-U', 'postgres', check=False).returncode == 0:
                break
        else:
            raise RuntimeError('PostgreSQL did not become ready')
        self.raw('postgres', "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE authenticator LOGIN NOINHERIT; GRANT anon, authenticated, service_role TO authenticator; CREATE DATABASE hierarchy; CREATE DATABASE invalid_hierarchy; CREATE DATABASE locked_hierarchy;")
        config = tomllib.loads((ROOT / 'supabase/config.toml').read_text(encoding='utf-8'))
        assert 'project_hierarchy_private' not in config['api']['schemas']
        self.bootstrap('hierarchy')
        self.bootstrap('invalid_hierarchy')
        self.bootstrap('locked_hierarchy')
        self.admin = self.connect()
        version = self.admin.scalar('SHOW server_version')
        assert version.startswith('17.'), version
        self.version = version

    def raw(self, database, sql, check=True):
        return self.docker('exec', '-i', self.container, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
                           '-U', 'postgres', '-d', database, input=sql, check=check)

    def bootstrap(self, database):
        # Minimal local auth contract. This is not the hosted Auth service/JWT verifier.
        self.raw(database, "CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;")
        for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            if migration < MIGRATION:
                self.raw(database, migration.read_text(encoding='utf-8'))

    def connect(self, **kwargs):
        connection = Connection(self, **kwargs)
        self.connections.append(connection)
        return connection

    def reset(self, count=4, existing_guard=True):
        self.admin.execute('TRUNCATE public.tasks, public.projects, project_hierarchy_private.account_guards')
        self.admin.execute(f"INSERT INTO auth.users VALUES ('{OWNER}'), ('{OTHER}') ON CONFLICT DO NOTHING")
        for owner, offset in [(OWNER, 0), (OTHER, 20)]:
            for index in range(1, count + 1):
                self.admin.execute(f"INSERT INTO public.projects(id,user_id,name) VALUES ('{ident(index + offset)}','{owner}','P{index}')")
        if existing_guard:
            self.admin.execute(f"INSERT INTO project_hierarchy_private.account_guards(user_id) VALUES ('{OWNER}'),('{OTHER}')")

    def audit(self):
        # Independent Python traversal, not the trigger/preflight implementation.
        rows = json.loads(self.admin.scalar("SELECT coalesce(json_agg(json_build_array(id,user_id,parent_project_id)), '[]') FROM public.projects"))
        graph = {row[0]: (row[1], row[2]) for row in rows}
        for start, (owner, _) in graph.items():
            seen = set()
            current = start
            while current is not None:
                if current in seen:
                    raise RuntimeError('STOP: committed hierarchy contains a cycle')
                seen.add(current)
                assert current in graph and graph[current][0] == owner
                current = graph[current][1]
        return len(graph)

    def blocked(self, connection, blocker):
        deadline = time.monotonic() + 8
        blockers = blocker if isinstance(blocker, list) else [blocker]
        pids = ','.join(str(item.pid) for item in blockers)
        while time.monotonic() < deadline:
            if self.admin.scalar(f'SELECT ARRAY[{pids}] && pg_blocking_pids({connection.pid})') == 't':
                return
        raise RuntimeError('Expected database blocking relationship was not observed')

    def record(self, name, **details):
        self.results.append({'test': name, **details, 'acyclic_rows': self.audit()})
        print(json.dumps(self.results[-1]), flush=True)

    def stop(self):
        for connection in self.connections:
            connection.close()
        inspected = self.docker('inspect', '--format', '{{index .Config.Labels "life-is-too-short.disposable"}}', self.container, check=False)
        if inspected.returncode == 0:
            assert inspected.stdout.strip() == 'hierarchy' and self.container.startswith('litshierarchy-')
            self.docker('rm', '--force', self.container)


def expect_error(connection, sql, state):
    try:
        connection.execute(sql)
    except SqlError as error:
        assert error.state == state, str(error)
        return error.state
    raise AssertionError(f'Expected SQLSTATE {state}: {sql}')


def move(number, parent):
    value = 'NULL' if parent is None else f"'{ident(parent)}'"
    return f"UPDATE public.projects SET parent_project_id={value} WHERE id='{ident(number)}'"


def run(lab, least_privilege=False):
    if not least_privilege:
        # Existing rootless cycle must abort BEFORE creating any new objects or role.
        bad = lab.connect(database='invalid_hierarchy')
        bad.execute(f"INSERT INTO auth.users VALUES ('{OWNER}')")
        bad.execute(f"INSERT INTO public.projects(id,user_id,name) VALUES ('{ident(1)}','{OWNER}','A'),('{ident(2)}','{OWNER}','B')")
        bad.execute(move(1, 2)); bad.execute(move(2, 1))
        audit = lab.raw('invalid_hierarchy', (ROOT / 'supabase/tests/project-hierarchy/preflight.sql').read_text(encoding='utf-8'))
        assert ident(1) in audit.stdout and ident(2) in audit.stdout
        failed = lab.raw('invalid_hierarchy', MIGRATION.read_text(encoding='utf-8'), check=False)
        assert failed.returncode != 0 and 'Existing project hierarchy contains a cycle' in failed.stdout
        assert bad.scalar("SELECT to_regnamespace('project_hierarchy_private') IS NULL") == 't'
        assert bad.scalar('SELECT count(*) FROM public.projects') == '2'
        assert bad.scalar("SELECT count(*) FROM pg_roles WHERE rolname='project_hierarchy_checker'") == '0'
        bad.close()
        lab.raw('hierarchy', MIGRATION.read_text(encoding='utf-8'))
    lab.reset()
    if not least_privilege:
        lab.record('preflight rejects existing rootless cycles without repairs', migration_aborted=True)

    user = lab.connect(role='authenticated')
    user.execute(move(2, 1)); user.execute(move(3, 2))
    revision = lab.admin.scalar(f"SELECT revision FROM project_hierarchy_private.account_guards WHERE user_id='{OWNER}'")
    expect_error(user, move(1, 1), '23514')
    expect_error(user, move(1, 2), '23514')
    expect_error(user, move(1, 3), '23514')
    assert lab.admin.scalar(f"SELECT revision FROM project_hierarchy_private.account_guards WHERE user_id='{OWNER}'") == revision
    user.execute(move(3, 4)); user.execute(move(3, None))
    user.execute(f"UPDATE public.projects SET name='Renamed' WHERE id='{ident(3)}'")
    user.execute(f"INSERT INTO public.projects(id,user_id,name,parent_project_id) VALUES ('{ident(9)}','{OWNER}','Child','{ident(2)}')")
    lab.record('sequential creation rename reparent root and cycle checks')

    lab.reset()
    expect_error(user, f"UPDATE public.projects SET parent_project_id=CASE id WHEN '{ident(1)}'::uuid THEN '{ident(2)}'::uuid ELSE '{ident(1)}'::uuid END WHERE id IN ('{ident(1)}','{ident(2)}')", '23514')
    expect_error(user, f"INSERT INTO public.projects(id,user_id,name,parent_project_id) VALUES ('{ident(8)}','{OWNER}','A','{ident(9)}'),('{ident(9)}','{OWNER}','B','{ident(8)}')", '23514')
    user.execute(f"INSERT INTO public.projects(id,user_id,name,parent_project_id) VALUES ('{ident(8)}','{OWNER}','A','{ident(1)}'),('{ident(9)}','{OWNER}','B','{ident(8)}')")
    user.execute(f"UPDATE public.projects SET parent_project_id='{ident(3)}' WHERE id IN ('{ident(1)}','{ident(2)}')")
    lab.record('multi-row updates and inserts rollback invalid graphs')

    lab.reset()
    user.execute(f"INSERT INTO public.projects(id,user_id,name,parent_project_id) VALUES ('{ident(1)}','{OWNER}','upsert','{ident(2)}') ON CONFLICT(id) DO UPDATE SET parent_project_id=excluded.parent_project_id")
    expect_error(user, f"INSERT INTO public.projects(id,user_id,name,parent_project_id) VALUES ('{ident(2)}','{OWNER}','upsert','{ident(1)}') ON CONFLICT(id) DO UPDATE SET parent_project_id=excluded.parent_project_id", '23514')
    lab.record('upsert cannot bypass integrity trigger')

    # Deliberately corrupt only this disposable fixture to exercise repeated ancestors
    # not containing the newly edited project. No migration silently repairs it.
    lab.reset()
    lab.admin.execute('ALTER TABLE public.projects DISABLE TRIGGER projects_hierarchy_acyclic')
    lab.admin.execute(move(1, 2)); lab.admin.execute(move(2, 1))
    lab.admin.execute('ALTER TABLE public.projects ENABLE TRIGGER projects_hierarchy_acyclic')
    expect_error(user, move(3, 1), '23514')
    lab.admin.execute(f"UPDATE public.projects SET parent_project_id=NULL WHERE id IN ('{ident(1)}','{ident(2)}')")
    lab.record('repeated ancestor check terminates and rejects corrupt ancestry')

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for isolation in ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']:
            for existing in [True, False]:
                lab.reset(existing_guard=existing)
                first, second = lab.connect(role='authenticated'), lab.connect(role='authenticated')
                for connection in [first, second]:
                    connection.execute(f'BEGIN ISOLATION LEVEL {isolation}')
                    connection.execute('SELECT count(*) FROM public.projects')  # establish snapshot
                first.execute(move(1, 2))
                waiting = pool.submit(second.execute, move(2, 1))
                lab.blocked(second, first)
                first.execute('COMMIT')
                try:
                    waiting.result(timeout=15)
                    raise RuntimeError('STOP: reciprocal reparenting was accepted')
                except SqlError as error:
                    expected = '23514' if isolation == 'READ COMMITTED' else '40001'
                    assert error.state == expected, str(error)
                    second.execute('ROLLBACK')
                lab.record('reciprocal reparenting', isolation=isolation, existing_guard=existing, winner='first', loser_sqlstate=expected)

        for isolation in ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']:
            for existing in [True, False]:
                lab.reset(existing_guard=existing)
                first, second, third = [lab.connect(role='authenticated') for _ in range(3)]
                for connection in [first, second, third]:
                    connection.execute(f'BEGIN ISOLATION LEVEL {isolation}')
                    connection.execute('SELECT count(*) FROM public.projects')
                first.execute(move(1, 2))
                second_work = pool.submit(second.execute, move(2, 3))
                third_work = pool.submit(third.execute, move(3, 1))
                lab.blocked(second, first); lab.blocked(third, [first, second])
                first.execute('COMMIT')
                outcomes = {'A_to_B': '00000'}
                pending = {second_work: (second, 'B_to_C'), third_work: (third, 'C_to_A')}
                while pending:
                    done, _ = concurrent.futures.wait(pending, timeout=15, return_when=concurrent.futures.FIRST_COMPLETED)
                    assert done, 'Concurrent test did not settle'
                    for future in done:
                        connection, action = pending.pop(future)
                        try:
                            future.result(); connection.execute('COMMIT'); outcomes[action] = '00000'
                        except SqlError as error:
                            assert error.state in ('23514', '40001', '40P01'), str(error)
                            connection.execute('ROLLBACK'); outcomes[action] = error.state
                assert list(outcomes.values()).count('00000') < 3
                lab.record('three-project concurrent cycle', isolation=isolation, existing_guard=existing, outcomes=outcomes)

        # A serialization failure must undo writes preceding the failed edge.
        lab.reset()
        first, second = lab.connect(role='authenticated'), lab.connect(role='authenticated')
        second.execute('BEGIN ISOLATION LEVEL REPEATABLE READ')
        second.execute(f"UPDATE public.projects SET name='uncommitted marker' WHERE id='{ident(4)}'")
        first.execute(move(1, 2))
        expect_error(second, move(2, 1), '40001'); second.execute('ROLLBACK')
        assert lab.admin.scalar(f"SELECT name FROM public.projects WHERE id='{ident(4)}'") == 'P4'
        lab.record('serialization failure rolls back prior writes', sqlstate='40001')

        # Migration installation waits on project writers, then honors its timeout.
        locker = lab.connect(database='locked_hierarchy')
        locker.execute('BEGIN'); locker.execute('LOCK TABLE public.projects IN ROW EXCLUSIVE MODE')
        installation = pool.submit(lab.raw, 'locked_hierarchy', MIGRATION.read_text(encoding='utf-8'), False)
        deadline = time.monotonic() + 8
        observed = False
        while time.monotonic() < deadline and not installation.done():
            if lab.admin.scalar(f"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname='locked_hierarchy' AND {locker.pid}=ANY(pg_blocking_pids(pid)))") == 't':
                observed = True; break
        assert observed, 'Migration lock wait was not observed'
        failed_install = installation.result(timeout=12)
        assert failed_install.returncode != 0 and 'lock timeout' in failed_install.stdout
        locker.execute('ROLLBACK')
        assert locker.scalar("SELECT to_regnamespace('project_hierarchy_private') IS NULL") == 't'
        lab.record('installation lock timeout aborts transaction', sqlstate='55P03', configured_timeout='5s')

        # Both accounts must progress independently while one account holds its guard.
        lab.reset()
        first, other = lab.connect(role='authenticated'), lab.connect(role='authenticated', owner=OTHER)
        first.execute('BEGIN'); first.execute(move(1, 2))
        pool.submit(other.execute, move(21, 22)).result(timeout=3)
        first.execute('COMMIT')
        lab.record('different accounts do not share the guard')

        # Deterministic deadlock: hold distinct project rows, then request each other's.
        lab.reset()
        first, second = lab.connect(role='authenticated'), lab.connect(role='authenticated')
        first.execute('BEGIN'); second.execute('BEGIN')
        first.execute(f"UPDATE public.projects SET name='first marker' WHERE id='{ident(1)}'")
        second.execute(f"UPDATE public.projects SET name='second marker' WHERE id='{ident(2)}'")
        first.execute(move(1, 3))
        first_work = pool.submit(first.execute, move(2, 3)); lab.blocked(first, second)
        second_work = pool.submit(second.execute, move(1, 3))
        pending = {first_work: (first, 1, 'P1'), second_work: (second, 2, 'P2')}
        victim = None
        while pending:
            done, _ = concurrent.futures.wait(pending, timeout=15, return_when=concurrent.futures.FIRST_COMPLETED)
            assert done
            for future in done:
                connection, number, original_name = pending.pop(future)
                try:
                    future.result(); connection.execute('COMMIT')
                except SqlError as error:
                    assert error.state == '40P01', str(error)
                    connection.execute('ROLLBACK'); victim = (number, original_name)
        assert victim
        assert lab.admin.scalar(f"SELECT name FROM public.projects WHERE id='{ident(victim[0])}'") == victim[1]
        lab.record('deadlock rolls back prior writes', sqlstate='40P01', victim_project=victim[0])

        # Existing deletion RPC holds the target, promotes children, preserves tasks.
        lab.reset()
        user.execute(move(2, 1)); user.execute(move(3, 2))
        lab.admin.execute(f"INSERT INTO public.tasks(id,user_id,title,project_id) VALUES ('{ident(90)}','{OWNER}','direct','{ident(1)}'),('{ident(91)}','{OWNER}','grandchild','{ident(3)}')")
        user.execute(f"SELECT public.delete_project('{ident(1)}')")
        assert lab.admin.scalar(f"SELECT parent_project_id IS NULL FROM public.projects WHERE id='{ident(2)}'") == 't'
        assert lab.admin.scalar(f"SELECT parent_project_id FROM public.projects WHERE id='{ident(3)}'") == ident(2)
        assert lab.admin.scalar(f"SELECT project_id IS NULL FROM public.tasks WHERE id='{ident(90)}'") == 't'
        assert lab.admin.scalar(f"SELECT project_id FROM public.tasks WHERE id='{ident(91)}'") == ident(3)
        lab.record('delete_project preserves promotion and task semantics')

        lab.reset()
        deleting, moving = lab.connect(role='authenticated'), lab.connect(role='authenticated')
        deleting.execute('BEGIN'); deleting.execute(f"SELECT public.delete_project('{ident(1)}')")
        waiting = pool.submit(moving.execute, move(2, 1)); lab.blocked(moving, deleting)
        deleting.execute('COMMIT')
        try:
            waiting.result(timeout=15)
            raise AssertionError('Move to deleted parent succeeded')
        except SqlError as error:
            assert error.state == '23503', str(error)
        lab.record('delete wins reparent race', loser_sqlstate='23503')

        # Reparent wins: deletion must promote a newly committed direct child.
        lab.reset()
        moving, deleting = lab.connect(role='authenticated'), lab.connect(role='authenticated')
        moving.execute('BEGIN'); moving.execute(move(2, 1))
        waiting = pool.submit(deleting.execute, f"SELECT public.delete_project('{ident(1)}')")
        lab.blocked(deleting, moving)
        moving.execute('COMMIT'); waiting.result(timeout=15)
        assert lab.admin.scalar(f"SELECT parent_project_id IS NULL FROM public.projects WHERE id='{ident(2)}'") == 't'
        lab.record('reparent wins deletion race and child is promoted')

    lab.reset()
    before = lab.admin.scalar('SELECT count(*) FROM public.projects')
    user.execute(move(21, 1))  # RLS hides the foreign account row: zero rows modified.
    assert lab.admin.scalar(f"SELECT parent_project_id IS NULL FROM public.projects WHERE id='{ident(21)}'") == 't'
    expect_error(user, move(1, 21), '23503')
    expect_error(user, f"UPDATE public.projects SET user_id='{OTHER}' WHERE id='{ident(1)}'", '42501')
    expect_error(user, f"SELECT public.delete_project('{ident(21)}')", 'P0001')
    anonymous = lab.connect(role='anon')
    expect_error(anonymous, f"INSERT INTO public.projects(user_id,name) VALUES ('{OWNER}','denied')", '42501')
    for role in ['authenticated', 'anon', 'service_role']:
        connection = lab.connect(role=role)
        expect_error(connection, 'UPDATE project_hierarchy_private.account_guards SET revision=0', '42501')
        expect_error(connection, 'SET ROLE project_hierarchy_checker', '42501')
    expect_error(user, 'ALTER TABLE public.projects DISABLE TRIGGER projects_hierarchy_acyclic', '42501')
    expect_error(user, "SET session_replication_role='replica'", '42501')
    service = lab.connect(role='service_role')
    service.execute(move(1, 2)); expect_error(service, move(2, 1), '23514')
    lab.record('RLS and new guard permission boundaries', role_checks=['authenticated', 'anon', 'service_role'])

    # Document, do not silently repair, the baseline's unrelated TRUNCATE grants.
    privilege_finding = []
    for role in ['authenticated', 'anon']:
        connection = lab.connect(role=role)
        if least_privilege:
            expect_error(connection, 'TRUNCATE public.tasks, public.projects', '42501')
        else:
            connection.execute('BEGIN')
            connection.execute('TRUNCATE public.tasks, public.projects')
            assert connection.scalar('SELECT count(*) FROM public.projects') == '0'
            connection.execute('ROLLBACK')
            assert lab.admin.scalar('SELECT count(*) FROM public.projects') == before
            privilege_finding.append(role)
    lab.record('TRUNCATE denied' if least_privilege else 'separate baseline TRUNCATE finding (rolled back)', allowed_roles=privilege_finding)

    # New helper has only graph SELECT columns and guard INSERT/UPDATE rights.
    checker = lab.connect(role='project_hierarchy_checker')
    expect_error(checker, 'SELECT name FROM public.projects', '42501')
    expect_error(checker, 'DELETE FROM project_hierarchy_private.account_guards', '42501')
    expect_error(checker, move(1, None), '42501')
    assert checker.scalar("SELECT has_schema_privilege(current_user,'project_hierarchy_private','CREATE')") == 'f'
    assert lab.admin.scalar("SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolbypassrls FROM pg_roles WHERE rolname='project_hierarchy_checker'") == 't'
    assert lab.admin.scalar("SELECT provolatile='v' AND prosecdef FROM pg_proc WHERE oid='project_hierarchy_private.enforce_acyclic_projects()'::regprocedure") == 't'
    lab.record('function owner least privilege')

    lab.admin.execute(f"DELETE FROM auth.users WHERE id='{OWNER}'")
    assert lab.admin.scalar(f"SELECT count(*) FROM project_hierarchy_private.account_guards WHERE user_id='{OWNER}'") == '0'
    assert lab.admin.scalar(f"SELECT count(*) FROM public.projects WHERE user_id='{OWNER}'") == '0'
    lab.record('account deletion cascades guard cleanup')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', default='public.ecr.aws/supabase/postgres:17.6.1.063')
    parser.add_argument('--report', type=pathlib.Path)
    args = parser.parse_args()
    lab = Lab(args.image)
    try:
        lab.start()
        run(lab)
        report = {'server': lab.version, 'image': args.image, 'network': 'none', 'results': lab.results}
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(f'PASS: {len(lab.results)} schedules/check groups', flush=True)
    finally:
        lab.stop()


if __name__ == '__main__':
    main()

"""Check #75's sender ACL setup in an isolated PostgreSQL role fixture."""

import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True
Lab = runpy.run_path(str(Path(__file__).with_name('test-project-hierarchy-db.py')))['Lab']
root = Path(__file__).resolve().parent.parent
migration = (root / 'supabase/migrations/20261109060000_add_private_task_broadcast.sql').read_text()
start = migration.index('CREATE ROLE task_notification_sender ')
end = migration.index('CREATE POLICY task_notifications_server_send ', start)
sender_setup = migration[start:end]
send = 'realtime.send(jsonb,text,text,boolean)'
database = 'hierarchy'


def run(lab):
    def fixture_admin(sql):
        result = lab.docker('exec', '-i', lab.container, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
                            '-U', 'fixture_admin', '-d', database, input=sql, check=False)
        assert result.returncode == 0, result.stdout

    def migrate(sql):
        return lab.raw(database, sql, check=False)

    def assert_rolled_back():
        result = migrate("""
            SELECT to_regrole('task_notification_sender') IS NULL
               AND to_regnamespace('task_notification_private') IS NULL;
        """)
        assert result.returncode == 0 and result.stdout.strip() == 't', result.stdout

    lab.raw(database, 'CREATE ROLE fixture_admin LOGIN SUPERUSER;')
    fixture_admin(f"""
        ALTER ROLE postgres RENAME TO fixture_bootstrap;
        CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE;
        GRANT CREATE ON DATABASE hierarchy TO postgres;
        CREATE ROLE supabase_realtime_admin NOLOGIN;
        CREATE SCHEMA realtime AUTHORIZATION supabase_realtime_admin;
        SET ROLE supabase_realtime_admin;
        CREATE TABLE realtime.messages (
            id uuid, payload jsonb, event text, topic text, private boolean, extension text
        );
        CREATE FUNCTION {send} RETURNS void
            LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN RETURN; END; $$;
        GRANT USAGE ON SCHEMA realtime TO postgres WITH GRANT OPTION;
        GRANT INSERT (id,payload,event,topic,private,extension)
            ON realtime.messages TO postgres WITH GRANT OPTION;
        GRANT EXECUTE ON FUNCTION {send} TO postgres, PUBLIC;
        RESET ROLE;
    """)
    authority = migrate(f"""
        SELECT has_function_privilege(current_user, '{send}', 'EXECUTE')
           AND NOT has_function_privilege(current_user, '{send}', 'EXECUTE WITH GRANT OPTION')
           AND NOT pg_has_role(current_user, 'supabase_realtime_admin', 'USAGE')
           AND NOT pg_has_role(current_user, 'supabase_realtime_admin', 'SET');
    """)
    assert authority.returncode == 0 and authority.stdout.strip() == 't', authority.stdout

    old_grant = migrate(f"""
        BEGIN;
        CREATE ROLE task_notification_sender NOLOGIN NOINHERIT;
        GRANT EXECUTE ON FUNCTION {send} TO task_notification_sender;
        ROLLBACK;
    """)
    assert old_grant.returncode == 0 and 'no privileges were granted' in old_grant.stdout, old_grant.stdout
    assert_rolled_back()
    print('PASS: old GRANT warns under the reported authority')

    success = migrate(f"""
        BEGIN;
        {sender_setup}
        SELECT has_function_privilege('task_notification_sender', '{send}', 'EXECUTE')
           AND NOT EXISTS (
               SELECT FROM pg_proc AS p,
                   LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
               WHERE p.oid = '{send}'::regprocedure
                   AND acl.grantee = 'task_notification_sender'::regrole
           );
        ROLLBACK;
    """)
    assert success.returncode == 0 and success.stdout.strip() == 't', success.stdout
    assert_rolled_back()
    print('PASS: revised setup succeeds with PUBLIC EXECUTE and no direct sender function ACL')

    failure_cases = [
        (f'REVOKE EXECUTE ON FUNCTION {send} FROM PUBLIC;',
         'lacks EXECUTE on realtime.send',
         f'GRANT EXECUTE ON FUNCTION {send} TO PUBLIC;'),
        ('REVOKE GRANT OPTION FOR USAGE ON SCHEMA realtime FROM postgres;',
         'lacks required schema USAGE',
         'GRANT USAGE ON SCHEMA realtime TO postgres WITH GRANT OPTION;'),
        ('REVOKE GRANT OPTION FOR INSERT (payload) ON realtime.messages FROM postgres;',
         'lacks INSERT on realtime.messages.payload',
         'GRANT INSERT (payload) ON realtime.messages TO postgres WITH GRANT OPTION;'),
    ]
    for revoke, expected_error, restore in failure_cases:
        fixture_admin(revoke)
        failure = migrate(f'BEGIN;\n{sender_setup}\nCOMMIT;')
        assert failure.returncode != 0 and expected_error in failure.stdout, failure.stdout
        assert_rolled_back()
        fixture_admin(restore)
        print(f'PASS: sender {expected_error}, transaction rolls back')


if __name__ == '__main__':
    lab = Lab('public.ecr.aws/supabase/postgres:17.6.1.063')
    try:
        lab.start()
        print(f'PostgreSQL {lab.version}')
        run(lab)
    finally:
        lab.stop()

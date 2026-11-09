"""Review candidate ACL migration in a disposable, network-isolated PostgreSQL 17.

Python 3.11+, Docker and the cached image used by test-project-hierarchy-db.py.
No app secrets or hosted connections. Reuses PR #70's full concurrency harness.
"""
import importlib.util
import json
import pathlib
import sys

sys.dont_write_bytecode = True

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hierarchy_tests', ROOT / 'scripts/test-project-hierarchy-db.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
MIGRATION = ROOT / 'supabase/migrations/20261109040000_restrict_application_privileges.sql'


def inventory(lab):
    roles = ['anon', 'authenticated', 'service_role', 'project_hierarchy_checker']
    result = {}
    for role in roles:
        tables = {}
        for table in ['public.tasks', 'public.projects', 'project_hierarchy_private.account_guards']:
            tables[table] = [priv for priv in ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
                             if lab.admin.scalar(f"SELECT has_table_privilege('{role}','{table}','{priv}')") == 't']
        result[role] = {
            'tables': tables,
            'public_create': lab.admin.scalar(f"SELECT has_schema_privilege('{role}','public','CREATE')") == 't',
            'private_usage': lab.admin.scalar(f"SELECT has_schema_privilege('{role}','project_hierarchy_private','USAGE')") == 't',
            'functions': {function: lab.admin.scalar(f"SELECT has_function_privilege('{role}','{function}','EXECUTE')") == 't'
                          for function in ['public.set_updated_at()', 'public.delete_project(uuid)', 'project_hierarchy_private.enforce_acyclic_projects()']},
        }
    result['default_acls'] = lab.admin.execute("SELECT pg_get_userbyid(defaclrole), coalesce(n.nspname,'*'), defaclobjtype, defaclacl::text FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3")
    result['public_sequences'] = lab.admin.scalar("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'")
    return result


def compatibility(lab):
    lab.reset()
    user = lab.connect(role='authenticated')
    other = lab.connect(role='authenticated', owner=h.OTHER)
    task = h.ident(80)
    user.execute(f"INSERT INTO public.tasks(id,user_id,title,description,project_id) VALUES ('{task}','{h.OWNER}','Original','**Markdown**','{h.ident(1)}') RETURNING *")
    user.execute(f"UPDATE public.tasks SET title='Edited',description='Updated',is_done=true,status='done',planned_date='2026-11-09',due_date='2026-11-10',project_position=2000,planned_position=3000 WHERE id='{task}' RETURNING *")
    user.execute(f"UPDATE public.tasks SET project_id='{h.ident(2)}' WHERE id='{task}' RETURNING *")
    assert user.scalar(f"SELECT title || ':' || status FROM public.tasks WHERE id='{task}'") == 'Edited:done'
    assert user.scalar(f"SELECT updated_at >= created_at FROM public.tasks WHERE id='{task}'") == 't'
    assert other.scalar(f"SELECT count(*) FROM public.tasks WHERE id='{task}'") == '0'
    other.execute(f"UPDATE public.tasks SET title='intrusion' WHERE id='{task}'")
    other.execute(f"DELETE FROM public.tasks WHERE id='{task}'")
    assert user.scalar(f"SELECT title FROM public.tasks WHERE id='{task}'") == 'Edited'
    h.expect_error(user, f"INSERT INTO public.tasks(user_id,title) VALUES ('{h.OTHER}','forged')", '42501')
    h.expect_error(user, f"UPDATE public.tasks SET user_id='{h.OTHER}' WHERE id='{task}'", '42501')
    h.expect_error(user, f"UPDATE public.tasks SET project_id='{h.ident(21)}' WHERE id='{task}'", '23503')
    user.execute(f"DELETE FROM public.tasks WHERE id='{task}'")
    assert user.scalar(f"SELECT count(*) FROM public.tasks WHERE id='{task}'") == '0'
    user.execute(f"INSERT INTO public.projects(user_id,name,parent_project_id) VALUES ('{h.OWNER}','Generated ID','{h.ident(1)}') RETURNING *")
    user.execute(f"UPDATE public.projects SET name='Renamed',parent_project_id=NULL WHERE name='Generated ID' RETURNING *")
    h.expect_error(user, f"INSERT INTO public.projects(user_id,name) VALUES ('{h.OTHER}','forged')", '42501')
    h.expect_error(user, f"DELETE FROM public.projects WHERE id='{h.ident(1)}'", '42501')
    lab.record('authenticated task CRUD all mutation fields, RLS and generated project IDs')

    # Check effective privileges as well as actual denied commands.
    # Dedicated test-owned schema allows REFERENCES to be tested independently of CREATE.
    lab.admin.execute('CREATE SCHEMA privilege_test')
    lab.admin.execute('GRANT USAGE, CREATE ON SCHEMA privilege_test TO anon, authenticated, service_role')
    for role in ['anon', 'authenticated', 'service_role']:
        connection = lab.connect(role=role)
        for table in ['tasks', 'projects']:
            for priv in ['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN']:
                assert connection.scalar(f"SELECT has_table_privilege(current_user,'public.{table}','{priv}')") == 'f'
            h.expect_error(connection, f'TRUNCATE public.{table} CASCADE', '42501')
            h.expect_error(connection, f'CREATE TRIGGER forbidden BEFORE UPDATE ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', '42501')
            h.expect_error(connection, f'CREATE TABLE privilege_test.forbidden_reference (id uuid REFERENCES public.{table}(id))', '42501')
        h.expect_error(connection, 'CREATE TABLE public.forbidden(id int)', '42501')
        h.expect_error(connection, 'DROP TABLE public.projects', '42501')
        h.expect_error(connection, 'SELECT * FROM project_hierarchy_private.account_guards', '42501')
        h.expect_error(connection, 'DELETE FROM project_hierarchy_private.account_guards', '42501')
        h.expect_error(connection, 'SELECT public.set_updated_at()', '42501')
    lab.admin.execute('DROP SCHEMA privilege_test')
    anon = lab.connect(role='anon')
    for table in ['tasks', 'projects']:
        h.expect_error(anon, f'SELECT * FROM public.{table}', '42501')
        h.expect_error(anon, f'DELETE FROM public.{table}', '42501')
    h.expect_error(anon, f"SELECT public.delete_project('{h.ident(1)}')", '42501')
    lab.record('ordinary roles denied whole-table, DDL, trigger, reference and private operations')

    # Transactional probes verify future defaults without leaving probe objects.
    lab.admin.execute('BEGIN')
    lab.admin.execute('CREATE TABLE public.privilege_probe(id int)')
    lab.admin.execute('CREATE SEQUENCE public.privilege_probe_seq')
    lab.admin.execute('CREATE FUNCTION public.privilege_probe_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$')
    lab.admin.execute('CREATE FUNCTION project_hierarchy_private.privilege_probe_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$')
    for role in ['anon', 'authenticated', 'service_role']:
        for priv in ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']:
            assert lab.admin.scalar(f"SELECT has_table_privilege('{role}','public.privilege_probe','{priv}')") == 'f'
        for priv in ['USAGE', 'SELECT', 'UPDATE']:
            assert lab.admin.scalar(f"SELECT has_sequence_privilege('{role}','public.privilege_probe_seq','{priv}')") == 'f'
        for schema in ['public', 'project_hierarchy_private']:
            assert lab.admin.scalar(f"SELECT has_function_privilege('{role}','{schema}.privilege_probe_fn()','EXECUTE')") == 'f'
    lab.admin.execute('ROLLBACK')
    lab.record('future postgres tables sequences and functions default closed')


def main():
    lab = h.Lab('public.ecr.aws/supabase/postgres:17.6.1.063')
    try:
        lab.start()
        h.run(lab)
        before = inventory(lab)
        baseline = list(lab.results)
        # Each schedule uses independent backends; release the baseline batch
        # before repeating the matrix instead of increasing server limits.
        for connection in lab.connections:
            if connection is not lab.admin:
                connection.close()
        lab.connections = [lab.admin]
        lab.results = []
        lab.raw('hierarchy', MIGRATION.read_text(encoding='utf-8'))
        after = inventory(lab)
        compatibility(lab)
        h.run(lab, least_privilege=True)
        report = {'server': lab.version, 'network': 'none', 'before': before, 'after': after,
                  'baseline_checks': baseline, 'candidate_checks': lab.results}
        output = ROOT / 'documentation/verification/database-least-privilege-results.json'
        output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(f'PASS: {len(baseline)} baseline and {len(lab.results)} candidate check groups', flush=True)
    finally:
        lab.stop()


if __name__ == '__main__':
    main()

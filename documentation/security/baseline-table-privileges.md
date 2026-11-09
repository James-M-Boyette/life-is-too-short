# Separate security finding: baseline table privileges bypass RLS for TRUNCATE

## Evidence and scope

`supabase/migrations/20261008000000_baseline.sql` grants ALL on public.projects and public.tasks to anon, authenticated and service_role (lines 141–149), and defines broad public-schema default privileges. This includes TRUNCATE and TRIGGER, not just row CRUD.

In the isolated PostgreSQL 17.6 fixture with checked-in migrations, both anon and authenticated could execute `TRUNCATE public.tasks, public.projects` after assuming the role from a **non-superuser authenticator connection**. Each test was enclosed in BEGIN/ROLLBACK and verified all data returned; no hosted or existing local application data was used. The executable hierarchy harness and recorded results reproduce this finding.

[PostgreSQL RLS does not govern TRUNCATE or REFERENCES](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). Thus row policies do not constrain this command to an account. Foreign-key dependencies may require naming both tables, as the reproduction does. Direct SQL access or a callable database function capable of issuing that command could affect every account's data. This does **not** establish that arbitrary SQL/TRUNCATE is currently exposed through PostgREST or that hosted privileges match the checked-in snapshot.

## Separation from F5

The hierarchy migration does not change these existing privileges, deletion semantics or task permissions. Its new private schema/table/function explicitly revoke application-role access, and the dedicated helper role has only the required grants. Tested ordinary roles cannot assume the helper role, alter its guards, disable the project trigger, or set replica mode; service-role DML still runs the integrity trigger. Broad existing TRIGGER rights nevertheless warrant a separate audit of available callable functions and trigger creation, alongside the TRUNCATE grants.

## Recommended separate follow-up

Independently inspect effective deployed grants, role membership and function exposure with read-only authorization first. Inventory required table privileges, then propose a focused least-privilege migration removing unnecessary TRUNCATE/TRIGGER/REFERENCES and broad defaults where appropriate. Test permitted CRUD/RPC paths and prohibited whole-table operations in an isolated Supabase environment before requesting deployment approval. Do not infer safety from frontend controls or RLS alone.

No permission rewrite or hosted verification was performed in this PR. Treat the checked-in baseline exposure as a material finding requiring independent security review, while keeping its remediation separately scoped.

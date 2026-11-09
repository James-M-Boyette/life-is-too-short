-- Proposed and locally verified only. Hosted deployment needs separate approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Exact current application tables; preserve RLS, owners and helper column grants.
REVOKE ALL ON TABLE public.tasks, public.projects FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
-- Project deletion is exclusively through the existing ownership-checking RPC.
GRANT SELECT, INSERT, UPDATE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks, public.projects TO service_role;

-- Schema lookup is required, object creation is not.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Trigger invocation does not require callers to have function EXECUTE.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_project(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_project(uuid) TO authenticated, service_role;

-- UUID keys use no sequences. Do not grant future objects automatically.
-- Only change defaults for the creator recorded in the checked-in baseline.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- PostgreSQL's implicit PUBLIC EXECUTE is global: a schema-scoped REVOKE cannot
-- cancel it. This affects FUTURE postgres-created functions in every schema.
-- Future migrations must explicitly grant intended function entry points.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

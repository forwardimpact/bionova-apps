-- Schemas the Supabase services expect. supabase/postgres pre-creates several;
-- IF NOT EXISTS keeps this idempotent against the image's own bootstrap.
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS realtime;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- pg_net installs into the `net` schema; expose it to the trigger owner.
GRANT USAGE ON SCHEMA net TO postgres, service_role;

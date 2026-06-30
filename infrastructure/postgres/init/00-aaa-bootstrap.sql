-- The supabase/postgres image bootstraps its superuser as `supabase_admin` and
-- does not create a `postgres` role before /docker-entrypoint-initdb.d/*.sql
-- runs. pg_net (and our later scripts) reference `postgres`, so create it first.
-- This file sorts ahead of 00-extensions.sql ("aaa" < "extensions").
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres SUPERUSER LOGIN CREATEDB CREATEROLE REPLICATION BYPASSRLS;
  END IF;
END $$;

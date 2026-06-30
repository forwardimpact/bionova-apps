#!/bin/bash
# Create/align the Supabase service roles at the configured password. Runs once
# on first init. supabase/postgres pre-creates most of these; we ensure they
# exist and share $POSTGRES_PASSWORD so the compose service URIs authenticate.
set -euo pipefail
PW="${POSTGRES_PASSWORD:-postgres}"

psql -v ON_ERROR_STOP=1 --username "postgres" --dbname "postgres" <<-SQL
  -- authenticator is the role PostgREST/pgbouncer log in as; it can switch to
  -- anon / authenticated / service_role per the request JWT.
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
      CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${PW}';
    ELSE
      ALTER ROLE authenticator WITH LOGIN PASSWORD '${PW}';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
      CREATE ROLE supabase_admin LOGIN SUPERUSER PASSWORD '${PW}';
    ELSE
      ALTER ROLE supabase_admin WITH LOGIN PASSWORD '${PW}';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      CREATE ROLE supabase_auth_admin LOGIN CREATEROLE PASSWORD '${PW}';
    ELSE
      ALTER ROLE supabase_auth_admin WITH LOGIN PASSWORD '${PW}';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
      CREATE ROLE supabase_storage_admin LOGIN CREATEROLE PASSWORD '${PW}';
    ELSE
      ALTER ROLE supabase_storage_admin WITH LOGIN PASSWORD '${PW}';
    END IF;
  END \$\$;

  GRANT anon, authenticated, service_role TO authenticator;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
SQL

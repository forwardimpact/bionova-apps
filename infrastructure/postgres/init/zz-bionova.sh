#!/bin/bash
# Runs LAST (sorts after the image's own init-scripts/ — "zz" > "init-scripts"),
# so anon/authenticated/service_role/authenticator/supabase_* already exist. We
# only (1) ensure the extensions Polaris needs are present and (2) align the
# service-role passwords with $POSTGRES_PASSWORD so the compose service URIs
# authenticate. We do NOT create the Supabase roles — the image owns those.
set -euo pipefail
PW="${POSTGRES_PASSWORD:-postgres}"

# Connect as supabase_admin — the image's bootstrap superuser. The `postgres`
# role exists but the image's init-scripts leave it non-superuser, so it cannot
# ALTER the other service roles.
psql -v ON_ERROR_STOP=1 --username supabase_admin --dbname postgres <<-SQL
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_net;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS pgjwt CASCADE;

  -- Align passwords for the roles the compose services log in as.
  -- supabase db push connects as `postgres`; make it a full superuser so it can
  -- create objects in public (PG15 revokes public CREATE; the image leaves
  -- `postgres` non-superuser). This matches a standard self-hosted Supabase.
  ALTER ROLE postgres                WITH LOGIN SUPERUSER PASSWORD '${PW}';
  ALTER ROLE authenticator           WITH LOGIN PASSWORD '${PW}';
  ALTER ROLE supabase_admin          WITH LOGIN PASSWORD '${PW}';
  ALTER ROLE supabase_auth_admin     WITH LOGIN PASSWORD '${PW}';
  ALTER ROLE supabase_storage_admin  WITH LOGIN PASSWORD '${PW}';

  -- PostgREST needs anon/authenticated/service_role reachable from authenticator.
  GRANT anon, authenticated, service_role TO authenticator;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA net TO postgres, service_role;
SQL

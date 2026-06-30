# supabase/postgres ships pgvector, pg_cron, pg_net, pgjwt, pgsodium, pgaudit,
# pgcrypto, and uuid-ossp in one image. pgvector/pgvector lacks pg_net, which
# the notify-updates trigger and the sync-listings pg_cron schedule require.
FROM supabase/postgres:15.6.1.143

# init/ runs once, on an empty data dir, in filename order:
#   00-extensions.sql  → required extensions
#   01-roles.sh        → PostgREST/GoTrue/Storage roles at $POSTGRES_PASSWORD
#   02-schemas.sql     → auth/storage/realtime/net schemas
COPY init/ /docker-entrypoint-initdb.d/

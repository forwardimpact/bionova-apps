#!/usr/bin/env bash
# Idempotent bootstrap: wait for core services, render + apply the seed from the
# vendored story.dsl, then populate embeddings. Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Load .env so POSTGRES_PASSWORD / *_KEY are available to the steps below.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
: "${POSTGRES_PASSWORD:=postgres}"
: "${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY must be set (see .env.example)}"

wait_healthy() {
  local svc="$1" timeout="${2:-120}"
  for _ in $(seq 1 "$timeout"); do
    if docker compose ps "$svc" --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
      return 0
    fi
    sleep 1
  done
  echo "Service $svc not healthy after ${timeout}s" >&2
  exit 1
}

# Step A — wait for core services (part 01)
echo "Waiting for core services…"
for svc in postgres pgbouncer postgrest gotrue tei; do wait_healthy "$svc"; done

# Make the service-role key available to DB triggers (notify-updates, part 04).
psql_root() { docker compose exec -T postgres psql -U postgres -d postgres "$@"; }
psql_root -c "ALTER DATABASE postgres SET app.service_role_key = '${SERVICE_ROLE_KEY}';"

# Step B0 — render + stage seed from the vendored DSL (part 03)
echo "Building seed from data/synthetic/story.dsl…"
"$ROOT/scripts/build-seed.sh"

# Step B — apply migrations via supabase db push (parts 02 + 03)
echo "Running supabase db push…"
cd "$ROOT/products/polaris/site"
# --include-all applies every pending local migration regardless of its order
# relative to what is already recorded. Needed when re-seeding (e.g. SC7's
# destructive check deletes only the seed versions, leaving later ones behind);
# without it supabase refuses the "out of order" seed migrations.
npx -y supabase@1.219.2 db push --include-all \
  --db-url "postgres://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres"
cd "$ROOT"

# Reload PostgREST's schema cache. It loads the cache once at startup (before
# these migrations created the tables) and runs behind a transaction pooler with
# the NOTIFY reload channel disabled, so it will not pick up the new tables on
# its own. SIGUSR1 forces an in-place schema reload.
echo "Reloading PostgREST schema cache…"
docker compose kill -s SIGUSR1 postgrest >/dev/null 2>&1 || docker compose restart postgrest >/dev/null 2>&1
sleep 3

# Step C — populate condition_embeddings via the embed-seed edge function (part 04)
echo "Seeding embeddings via embed-seed edge function…"
curl --fail -sS -X POST "http://localhost:8000/functions/v1/embed-seed" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"source":"/data/synthetic/seed_embeddings.jsonl"}'
echo

echo "Setup complete."

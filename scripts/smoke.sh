#!/usr/bin/env bash
# End-to-end success-criteria smoke (SC1–SC7) against a freshly booted stack:
#   docker compose up -d --wait && ./setup.sh && scripts/smoke.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Normalize env: load .env, then expose the SUPABASE_* names the CLI/handlers read.
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi
: "${ANON_KEY:?set ANON_KEY (or copy .env.example to .env)}"
: "${SERVICE_ROLE_KEY:?set SERVICE_ROLE_KEY}"
export SUPABASE_URL="${SUPABASE_URL:-http://localhost:8000}"
export SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export TEI_URL="${TEI_URL:-http://localhost:8080}"

PASS=0; FAIL=0
note() { echo "→ $*"; }
ok()   { echo "  ✓ $*"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $*" >&2; FAIL=$((FAIL+1)); }
pg()   { docker compose exec -T postgres psql -U postgres -tAc "$1"; }

# SC1 — stack boots and seeds.
note "SC1: stack boots and seeds"
expected=(kong postgres pgbouncer postgrest gotrue realtime storage minio imgproxy tei polaris-site polaris-functions)
sc1_fail=0
for svc in "${expected[@]}"; do
  raw=$(docker compose ps "$svc" --format json 2>/dev/null || true)
  if [ -z "$raw" ]; then bad "$svc: not running"; sc1_fail=1; continue; fi
  state=$(printf '%s\n' "$raw" | jq -rs '.[0].Health // "missing"')
  [ "$state" = "healthy" ] || { bad "$svc: $state"; sc1_fail=1; }
done
[ "$sc1_fail" = "0" ] && ok "all ${#expected[@]} services healthy" || docker compose ps
emb_count=$(pg "SELECT COUNT(*) FROM condition_embeddings;")
test "${emb_count:-0}" -gt 0 && ok "embeddings seeded ($emb_count)" || bad "no embeddings (got '$emb_count')"
for t in condition_explainers trial_faqs consent_summaries site_descriptions patient_stories therapy_descriptions; do
  rows=$(pg "SELECT COUNT(*) FROM $t;")
  test "${rows:-0}" -gt 0 && ok "prose table $t seeded ($rows)" || bad "prose table $t empty (got '$rows')"
done

# SC2 — web search for a plain-language condition returns a diabetes condition match.
note "SC2: web search for 'high blood sugar'"
result=$(curl -fsS "http://localhost:3001/api/search?condition=high+blood+sugar")
matched=$(echo "$result" | jq -r '[.trials[].conditions[]?.name] | any(test("diabetes";"i"))')
[ "$matched" = "true" ] && ok "diabetes-related condition match for 'high blood sugar'" \
  || { bad "no diabetes condition match"; echo "$result" | jq -c '.trials[:3]'; }

# SC3 — eligibility screener returns "eligible" for a matching patient.
note "SC3: eligibility screener"
fixture="$ROOT/scripts/fixtures/eligible-patient.json"
sc3_trial_id="<unknown>"
if [ ! -s "$fixture" ]; then
  bad "fixtures/eligible-patient.json missing — run scripts/build-fixture.sh"
else
  sc3_trial_id=$(jq -r .trial_id "$fixture")
  payload=$(jq -c .payload "$fixture")
  score=$(curl -fsS -X POST "http://localhost:8000/functions/v1/eligibility-check" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d "$payload" | jq -r .match_score)
  [ "$score" = "eligible" ] && ok "matching patient → eligible (trial $sc3_trial_id)" \
    || bad "matching patient → $score (expected eligible; trial=$sc3_trial_id; rerun build-fixture.sh if seed changed)"
fi

# SC4 — prose surfaces render from the seed prose tables.
note "SC4: prose surfaces (FAQ, consent summary, explainer)"
sc4_trial_id="$sc3_trial_id"
if [ -z "$sc4_trial_id" ] || [ "$sc4_trial_id" = "<unknown>" ]; then
  sc4_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?select=id&limit=1" -H "apikey:$ANON_KEY" | jq -r '.[0].id')
fi
trial_prose=$(curl -fsS "http://localhost:3001/api/trials/$sc4_trial_id")
faq=$(echo "$trial_prose" | jq -r '.faq // ""')
consent=$(echo "$trial_prose" | jq -r '.consentSummary // ""')
{ [ -n "$faq" ] && [ "$faq" != "null" ]; } && ok "trial $sc4_trial_id has non-empty faq" || bad "trial $sc4_trial_id faq empty"
{ [ -n "$consent" ] && [ "$consent" != "null" ]; } && ok "trial $sc4_trial_id has non-empty consentSummary" || bad "trial $sc4_trial_id consentSummary empty"
sc4_condition_id=$(curl -fsS "http://localhost:8000/rest/v1/conditions?select=id&limit=1" -H "apikey:$ANON_KEY" | jq -r '.[0].id')
explainer=$(curl -fsS "http://localhost:3001/api/conditions/$sc4_condition_id" | jq -r '.explainer // ""')
{ [ -n "$explainer" ] && [ "$explainer" != "null" ]; } && ok "condition $sc4_condition_id has non-empty explainer" || bad "condition $sc4_condition_id explainer empty"

# SC5 — CLI search matches web search data.
note "SC5: CLI search matches web"
web_ids=$(curl -fsS "http://localhost:3001/api/search?condition=diabetes" | jq -r '[.trials[].id] | sort | join(",")')
cli_ids=$(node products/polaris/cli/bin/bionova-polaris.js search --condition=diabetes --json | jq -r '[.trials[].id] | sort | join(",")')
{ [ -n "$cli_ids" ] && [ "$cli_ids" = "$web_ids" ]; } && ok "cli ids = web ids" || bad "cli=$cli_ids web=$web_ids"

# SC6 — admin CLI update reflects in web.
note "SC6: admin update propagates"
sc6_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?status=eq.recruiting&select=id&limit=1" -H "apikey:$ANON_KEY" | jq -r '.[0].id')
if [ "$sc6_trial_id" = "$sc3_trial_id" ]; then
  sc6_trial_id=$(curl -fsS "http://localhost:8000/rest/v1/trials?status=eq.recruiting&select=id&id=neq.${sc3_trial_id}&limit=1" -H "apikey:$ANON_KEY" | jq -r '.[0].id')
fi
if [ -z "$sc6_trial_id" ] || [ "$sc6_trial_id" = "null" ]; then
  bad "no recruiting trial to update"
else
  node products/polaris/cli/bin/bionova-polaris.js admin trial "$sc6_trial_id" --update '{"status":"completed"}' >/dev/null
  new_status=$(curl -fsS "http://localhost:8000/rest/v1/trials?id=eq.${sc6_trial_id}&select=status" -H "apikey:$ANON_KEY" | jq -r '.[0].status')
  [ "$new_status" = "completed" ] && ok "REST shows completed (trial $sc6_trial_id)" || bad "REST shows '$new_status' (trial $sc6_trial_id)"
  api_status=$(curl -fsS "http://localhost:3001/api/trials/$sc6_trial_id" | jq -r .trial.status)
  [ "$api_status" = "completed" ] && ok "web /api/trials/$sc6_trial_id shows completed" || bad "web shows '$api_status'"
  web_code=$(curl -fsS -o /dev/null -w "%{http_code}" "http://localhost:3001/trials/$sc6_trial_id")
  [ "$web_code" = "200" ] && ok "web page renders trial" || bad "web page returned HTTP $web_code"
fi

# SC7 — seed regenerable from the vendored DSL (non-destructive render half).
note "SC7: seed regenerable from vendored DSL"
if [ ! -d "$ROOT/.git" ] || [ ! -d "$ROOT/data/synthetic" ]; then
  bad "SC7 \$ROOT=$ROOT is not the bionova-apps repo"
else
  bash "$ROOT/scripts/build-seed.sh" >/dev/null
  if (cd "$ROOT/data/synthetic/.build/products/polaris/site/supabase/migrations" \
      && sha256sum -c "$ROOT/data/synthetic/SEED.sha256" >/dev/null); then
    ok "deterministic render matches data/synthetic/SEED.sha256"
  else
    bad "render drift vs data/synthetic/SEED.sha256"
  fi
fi

# SC7 (DB half) — db push of staged migrations reproduces identical data.
# Destructive (truncates + re-applies), so gated behind SMOKE_DESTRUCTIVE=1.
note "SC7: staged migrations reproduce identical data"
if [ "${SMOKE_DESTRUCTIVE:-0}" != "1" ]; then
  ok "SC7 DB half skipped (set SMOKE_DESTRUCTIVE=1 to exercise the db-push path)"
else
  ORIG=$(pg "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
  docker compose exec -T postgres psql -U postgres -c \
    "TRUNCATE conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites, condition_embeddings, interest_signals CASCADE;"
  docker compose exec -T postgres psql -U postgres -c \
    "DELETE FROM supabase_migrations.schema_migrations WHERE version LIKE '20250101%';"
  (cd "$ROOT" && ./setup.sh) >/dev/null
  REGEN=$(pg "SELECT md5(string_agg(protocol_id || '|' || name, ',' ORDER BY protocol_id)) FROM trials;")
  [ "$ORIG" = "$REGEN" ] && ok "deterministic db push from rendered seed" || bad "db-push drift: $ORIG → $REGEN"
fi

echo "===================="
echo " PASS: $PASS  FAIL: $FAIL"
exit "$FAIL"

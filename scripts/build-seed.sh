#!/usr/bin/env bash
# Render the vendored story.dsl into a disposable build dir and stage the SQL
# into supabase/migrations. Credential-free: `build` renders from the committed
# prose cache with zero LLM calls.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SYN="$ROOT/data/synthetic"
BUILD="$SYN/.build"                                      # gitignored, disposable
OUT="$BUILD/products/polaris/site/supabase/migrations"   # terrain writes here
MIG="$ROOT/products/polaris/site/supabase/migrations"

# fit-terrain resolution. fit-terrain@0.1.41 carries --output-root (prereq A) and
# prose→SQL (prereq B), and is a devDependency, so `bun install` drops its bin at
# node_modules/.bin/fit-terrain. Default to that local bin: no live `bunx` fetch,
# which the CI runner's TLS-inspecting proxy blocks. Override FIT_TERRAIN to a
# local monorepo checkout if you need an unreleased build, e.g.:
#   export FIT_TERRAIN="node /path/to/monorepo/libraries/libterrain/bin/fit-terrain.js"
FIT_TERRAIN="${FIT_TERRAIN:-$ROOT/node_modules/.bin/fit-terrain}"

# Guard: never let terrain's rm -rf hit the repo root (would delete products/).
case "$BUILD" in "$ROOT") echo "FATAL: output root is repo root"; exit 1;; esac

# Verify the vendored sources are intact before rendering.
(cd "$SYN" && sha256sum -c SOURCE.sha256 >/dev/null) \
  || { echo "FAIL: vendored story.dsl/prose-cache do not match SOURCE.sha256"; exit 1; }

rm -rf "$BUILD"; mkdir -p "$BUILD"
# shellcheck disable=SC2086
$FIT_TERRAIN build \
  --story "$SYN/story.dsl" \
  --cache "$SYN/prose-cache.json" \
  --output-root "$BUILD"

# Assert the prose tables rendered (prerequisite B); fail loudly if dropped.
for t in condition_explainers trial_faqs consent_summaries \
         site_descriptions patient_stories therapy_descriptions; do
  ls "$OUT"/seed_*_"$t".sql >/dev/null 2>&1 \
    || { echo "FAIL: prose table $t missing — prerequisite B not in libterrain"; exit 1; }
done

# Stage SQL into supabase/migrations with 2025-prefixed, per-file-distinct
# versions so terrain files sort before hand-written 20260601* files (FK to
# trials resolves) and each records a unique version in schema_migrations.
mkdir -p "$MIG"
find "$MIG" -maxdepth 1 -name "20250101*_seed_*.sql" -delete
i=0
for f in "$OUT"/seed_*.sql; do
  i=$((i+1)); printf -v n '%04d' "$i"
  cp "$f" "$MIG/20250101${n}_$(basename "$f")"
done
cp "$OUT/seed_embeddings.jsonl" "$SYN/seed_embeddings.jsonl"   # for embed-seed mount
echo "Staged $i seed migrations + embeddings"

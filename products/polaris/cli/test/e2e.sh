#!/usr/bin/env bash
# End-to-end CLI smoke against a running stack (docker compose up && ./setup.sh).
set -euo pipefail
NODE="$(dirname "${BASH_SOURCE[0]}")/../bin/bionova-polaris.js"
: "${ANON_KEY:?set ANON_KEY}"

echo "Test 1: search diabetes"
output=$(node "$NODE" search --condition=diabetes)
echo "$output" | grep -qi "diabetes" || { echo "FAIL: no diabetes match"; exit 1; }

echo "Test 2: trial detail"
trial_id=$(curl -s "http://localhost:8000/rest/v1/trials?limit=1" -H "apikey:$ANON_KEY" | jq -r '.[0].id')
node "$NODE" trial "$trial_id" | grep -q "$trial_id" || { echo "FAIL"; exit 1; }

echo "Test 3: sites"
node "$NODE" sites | grep -qE "[A-Z][a-z]+, [A-Z]{2}" || { echo "FAIL: no city,state"; exit 1; }

echo "All CLI smoke tests pass."

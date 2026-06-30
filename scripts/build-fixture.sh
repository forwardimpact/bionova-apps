#!/usr/bin/env bash
# Build scripts/fixtures/eligible-patient.json from the live, seeded DB.
#
# The criteria schema is ONE row per trial: criteria(trial_id PK, inclusion
# jsonb, exclusion jsonb), where inclusion = {age_min, age_max,
# conditions_required[], ecog_max, custom[]}. A matching patient satisfies every
# inclusion criterion and trips no exclusion: age at the midpoint of the allowed
# range, the required conditions, ecog <= ecog_max, and every inclusion.custom[]
# answered true (keyed by the verbatim criterion string, which is exactly how the
# eligibility-check edge function reads custom_answers).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pg() { docker compose exec -T postgres psql -U postgres -tAc "$1"; }

trial_id=$(pg "
  SELECT t.id FROM trials t
  JOIN criteria c ON c.trial_id = t.id
  WHERE t.status = 'recruiting'
    AND jsonb_array_length(COALESCE(c.inclusion->'conditions_required','[]'::jsonb)) > 0
  ORDER BY t.id LIMIT 1;")
[ -n "$trial_id" ] || { echo "no qualifying recruiting trial in seed" >&2; exit 1; }

# Construct the matching payload directly from the inclusion JSONB.
payload=$(pg "
  WITH c AS (SELECT inclusion AS inc FROM criteria WHERE trial_id = '$trial_id')
  SELECT jsonb_build_object(
    'trial_id', '$trial_id',
    'age',  ((COALESCE((inc->>'age_min')::int, 30) + COALESCE((inc->>'age_max')::int, 70)) / 2),
    'ecog', COALESCE((inc->>'ecog_max')::int, 0),
    'conditions', COALESCE(inc->'conditions_required', '[]'::jsonb),
    'custom_answers', COALESCE(
      (SELECT jsonb_object_agg(value, true) FROM jsonb_array_elements_text(inc->'custom')), '{}'::jsonb)
  ) FROM c;")

jq -n --arg id "$trial_id" --argjson p "$payload" '{trial_id: $id, payload: $p}' \
  > "$ROOT/scripts/fixtures/eligible-patient.json"
echo "wrote scripts/fixtures/eligible-patient.json for trial $trial_id"

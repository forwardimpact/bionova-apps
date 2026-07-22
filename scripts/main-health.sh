#!/usr/bin/env bash
# main-health.sh — record main-branch CI health as an XmR metric point.
#
# Runs once per release-engineer shift. Counts non-success CI conclusions on the
# latest completed runs for the current tip of main, then appends the count to
# wiki/metrics/release-engineer/2026.csv via gemba-xmr. Turns the "zero red-days"
# target from a hand-sampled assumption into an earned, accruing series.
#
# Exits non-zero when main is red, so a shift can gate on it.
#
# Usage: scripts/main-health.sh
set -euo pipefail

git fetch --quiet origin main
sha=$(git rev-parse origin/main)

# Latest completed runs for this sha. A "red trunk" is a CI *quality gate* that
# genuinely failed — conclusion failure/timed_out/startup_failure. We exclude:
#   - "Agent: *" orchestration workflows (dispatch/storyboard churn, not CI)
#   - cancelled / skipped / neutral conclusions (not a broken build)
# Counting cancelled agent-dispatch runs as failures was the first design's bug.
failing=$(gh run list --branch main --limit 40 \
  --json headSha,status,conclusion,name \
  --jq "[.[]
         | select(.headSha == \"$sha\" and .status == \"completed\")
         | select((.name | startswith(\"Agent:\")) | not)
         | select(.conclusion == \"failure\" or .conclusion == \"timed_out\" or .conclusion == \"startup_failure\")]
        | length")

npx gemba-xmr record \
  --skill=release-engineer \
  --metric=main_ci_failing_checks \
  --value="$failing" \
  --unit=count \
  --note="main-health monitor @ ${sha:0:8}"

if [ "$failing" -gt 0 ]; then
  echo "main-health: RED — $failing failing check(s) on ${sha:0:8}. Repair this shift." >&2
  exit 1
fi
echo "main-health: green — 0 failing checks on ${sha:0:8}."

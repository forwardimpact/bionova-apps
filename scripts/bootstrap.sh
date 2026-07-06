#!/usr/bin/env bash
set -euo pipefail

bun install

# Reconstitute the APM skill packs + agent profiles. They are gitignored build
# output, and the kata agent workflows require .claude/agents/ + .claude/skills/
# present at run time — this is the step that rebuilds them on a fresh
# environment (CI agent runs and native Claude sessions alike). apm is on PATH
# via fit-install.sh.
#
# APM 0.12.4 has a race creating ~/.apm during concurrent dependency
# resolution. apm_cli/config.py ensure_config_exists() runs a bare
# "if not exists(~/.apm): os.makedirs(~/.apm)". Two resolver workers both see
# the dir absent, both create it, and the loser fails with "[Errno 17] File
# exists". One dependency is dropped non-deterministically. When the casualty
# is kata-skills the coaching harness has nothing to run and fast-fails with no
# trace. See issues #70 and #72.
#
# APM_RESOLVE_PARALLEL=1 forces the apm resolver onto its sequential path, one
# package at a time. That closes the race: only one worker creates ~/.apm. This
# is the lever that actually covers it. --parallel-downloads 0 gates a
# different pool (file downloads, not resolution) and does not stop this race.
# The flag is kept as belt-and-suspenders only; its removal waits for the bump
# (reframed AC#2 on #72).
#
# Both are temporary. Remove them when the APM bump lands (issue #72). apm
# >= v0.15.0 creates ~/.apm idempotently (exist_ok=True).
if [ -f apm.yml ] || [ -f apm.lock.yaml ]; then
  APM_RESOLVE_PARALLEL=1 apm install --parallel-downloads 0
fi

# Non-fatal so a missing or empty wiki never blocks a run.
npx fit-wiki init || echo "bootstrap: wiki init skipped" >&2
npx fit-wiki pull || echo "bootstrap: wiki pull skipped" >&2

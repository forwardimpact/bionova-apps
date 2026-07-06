#!/usr/bin/env bash
set -euo pipefail

bun install

# Reconstitute the APM skill packs + agent profiles. They are gitignored build
# output, and the kata agent workflows require .claude/agents/ + .claude/skills/
# present at run time — this is the step that rebuilds them on a fresh
# environment (CI agent runs and native Claude sessions alike). apm is on PATH
# via fit-install.sh.
#
# --parallel-downloads 0 serializes dependency resolution. APM 0.12.4 races on
# creating ~/.apm when it downloads packages concurrently: two downloads both
# mkdir the dir, the loser fails with "[Errno 17] File exists", and one
# dependency is dropped non-deterministically. When the casualty is kata-skills
# the coaching harness has nothing to run and fast-fails with no trace. See
# issue #70. Serializing costs a few seconds and removes the race entirely.
#
# This flag is temporary. Remove it when the APM bump lands (issue #72). The
# bump restores the --parallel-downloads default.
if [ -f apm.yml ] || [ -f apm.lock.yaml ]; then
  apm install --parallel-downloads 0
fi

# Non-fatal so a missing or empty wiki never blocks a run.
npx fit-wiki init || echo "bootstrap: wiki init skipped" >&2
npx fit-wiki pull || echo "bootstrap: wiki pull skipped" >&2

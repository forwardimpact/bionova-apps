#!/usr/bin/env bash
set -euo pipefail

bun install

# Reconstitute the APM skill packs + agent profiles. They are gitignored build
# output, and the kata agent workflows require .claude/agents/ + .claude/skills/
# present at run time — this is the step that rebuilds them on a fresh
# environment (CI agent runs and native Claude sessions alike). apm is on PATH
# via fit-install.sh.
if [ -f apm.yml ] || [ -f apm.lock.yaml ]; then
  apm install
fi

# Non-fatal so a missing or empty wiki never blocks a run.
npx fit-wiki init || echo "bootstrap: wiki init skipped" >&2
npx fit-wiki pull || echo "bootstrap: wiki pull skipped" >&2

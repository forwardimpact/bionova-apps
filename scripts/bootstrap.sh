#!/usr/bin/env bash
set -euo pipefail

bun install

# Non-fatal so a missing or empty wiki never blocks a run.
npx fit-wiki init || echo "bootstrap: wiki init skipped" >&2
npx fit-wiki pull || echo "bootstrap: wiki pull skipped" >&2

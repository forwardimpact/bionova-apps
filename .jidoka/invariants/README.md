# Repository invariants

`npx jidoka invariants` discovers and runs every `*.rules.mjs` module in this
directory. Each module declares one architectural rule the repository enforces —
a forbidden import, a value that must agree across files, a directory shape — and
fails the check when the rule is broken.

No rule modules exist yet. Author the first with the `jidoka-invariant` skill.
A natural candidate for BioNova Polaris: assert that no patient-facing string is
hand-authored in a handler, template, or migration, since the domain is rendered
from `data/synthetic/story.dsl` (see [CONTRIBUTING.md § Invariants](../../CONTRIBUTING.md)).

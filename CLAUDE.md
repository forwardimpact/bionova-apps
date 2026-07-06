# BioNova Polaris

## What this is

BioNova Polaris is patient-facing clinical trial discovery. The entire domain —
conditions, trials, sites, eligibility rules, explainers, FAQs, consent
summaries, and patient stories — is rendered from one file,
`data/synthetic/story.dsl`. There is no hand-authored domain content; the app is
a surface over a generated world.

This repository is the reference example of an **external team** consuming
Forward Impact shared libraries (`libcli`, `libui`, `libformat`, `libtemplate`,
`librepl`, `libutil`) and the synthetic-data build (`fit-terrain` + `story.dsl`).
It consumes those libraries from npm and publishes no library of its own.

## Who it serves

Three personas, named in [products/polaris/README.md](products/polaris/README.md):

- **Patient / Advocate** — find trials relevant to a condition without reading
  dense protocols.
- **Clinical Development Staff** — keep public trial listings matching the
  protocol and watch enrollment interest.
- **Referring Physician** — search and share trials on behalf of patients.

The progress each one seeks lives in [JTBD.md](JTBD.md). Discover every job with
`rg '<job '`.

## Where things live

[MONOREPO.md](MONOREPO.md) defines the directory shape. In short:

- `products/polaris/` — the product: `handlers/` (surface-agnostic logic),
  `cli/`, `site/` (Next.js).
- `services/polaris-functions/` — Deno Supabase Edge Functions.
- `data/synthetic/` — the domain source of truth: `story.dsl` + `prose-cache.json`,
  vendored verbatim from the Forward Impact monorepo.
- `infrastructure/` — the self-hosted Supabase (PG On Rails) stack.
- `scripts/` — `build-seed.sh`, `smoke.sh`, `build-fixture.sh`.
- `docs/` — deployment and day-2 operations.
- `wiki/` — agent memory home.

## Tooling

External users run Node.js + `npx`; internal contributors run Bun 1.2+ + `just`.
Common recipes (see [justfile](justfile)):

- `just boot` — render the seed, bring the stack up, run `setup.sh`.
- `just lint` / `just test` / `just smoke` — quality gates.
- `just cli search --condition=diabetes` — drive the CLI.

The seed render needs `FIT_TERRAIN` pointed at a local `fit-terrain` checkout
until the libterrain release carrying its prerequisites reaches npm. See
[data/synthetic/PROVENANCE.md](data/synthetic/PROVENANCE.md).

## How to contribute

[CONTRIBUTING.md](CONTRIBUTING.md) governs how — invariants, quality commands,
security policy, and the universal checklists. This file orients (what, who,
where); CONTRIBUTING.md governs (rules and policies). Read it before your first
commit.

## Writing style

All prose, from the web copy to commit messages, is simple and direct. One idea
per sentence. Avoid the tells of AI-generated text: em-dash asides, antithesis
pairs, rhetorical questions, and stacked noun chains.

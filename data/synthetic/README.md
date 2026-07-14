# data/synthetic

This directory is the app's **domain source of truth**. Everything BioNova
Polaris shows — every condition, trial, site, eligibility rule, explainer, FAQ,
consent summary, and patient story — originates here.

## What is committed

| File | Role |
| --- | --- |
| `story.dsl` | The synthetic-data DSL, vendored verbatim from the monorepo |
| `prose-cache.json` | The committed prose cache, which makes the build credential-free |
| `SOURCE.sha256` | Integrity of the two vendored files |
| `SEED.sha256` | Determinism anchor for the rendered SQL + embeddings |
| `PROVENANCE.md` | Where the DSL came from and which renderer produced the seed |

## What is rendered (gitignored)

`fit-terrain build` renders the seed into `data/synthetic/.build/` (disposable)
and `build-seed.sh` stages the SQL into
`products/polaris/site/supabase/migrations/20250101*_seed_*.sql`. None of that is
committed. It is regenerated from `story.dsl`. The build makes **no LLM calls**:
it renders from the committed prose cache, so no API key is needed.

## Auditing the app

To audit what the app contains, read `story.dsl` — one legible DSL file — not the
SQL dumps. The clinical entities (conditions, trials, sites, criteria) and the
six prose types are all defined or generated there.

## Regenerating locally

```sh
bash scripts/build-seed.sh           # renders + stages the seed
```

See [PROVENANCE.md](PROVENANCE.md) for the `FIT_TERRAIN` note (the
`--output-root` + prose→SQL features ship in `fit-terrain@0.1.41`).

## Refreshing the domain

1. Edit `story.dsl` in the monorepo and regenerate its prose cache there.
2. Re-vendor `story.dsl` + `prose-cache.json` here; update `SOURCE.sha256`.
3. Run `build-seed.sh`; refresh `SEED.sha256`; bump the provenance SHA.
4. Commit.

# BioNova Polaris

Patient-facing clinical trial discovery, built on Forward Impact shared
libraries and the synthetic-data pipeline. Polaris reads its entire domain —
every condition, trial, site, eligibility rule, explainer, FAQ, consent summary,
and patient story — from one file: `data/synthetic/story.dsl`. There is no
hand-authored domain content. The app is a surface over a generated world.

This repository is the reference example of an **external team** consuming
Forward Impact libraries (`libcli`, `libui`, `libformat`, `libtemplate`,
`librepl`, `libutil`) and the synthetic-data build (`fit-terrain` + `story.dsl`).

## Quickstart

```sh
git clone …
cd bionova-apps
cp .env.example .env          # fill in secrets
bash scripts/build-seed.sh    # render the seed JSONL from story.dsl FIRST (it is bind-mounted)
docker compose up -d --wait
./setup.sh                    # applies migrations + seeds embeddings
```

> The seed must be rendered **before** `docker compose up`: the
> `polaris-functions` service bind-mounts `data/synthetic/seed_embeddings.jsonl`,
> so that file has to exist on the host first. `just boot` runs the three steps
> in order. The seed render uses the pinned `fit-terrain` devDependency by
> default; set `FIT_TERRAIN` to a local checkout only to render with an
> unreleased build (see
> [data/synthetic/PROVENANCE.md](data/synthetic/PROVENANCE.md)).

Visit <http://localhost:3001/> — or from the CLI:

```sh
bionova-polaris search --condition=diabetes
```

## How the data works

`data/synthetic/story.dsl` and `prose-cache.json` are vendored **verbatim** from
the Forward Impact monorepo (provenance recorded in
[`data/synthetic/PROVENANCE.md`](data/synthetic/PROVENANCE.md)). `setup.sh` runs
`fit-terrain build` against them to render the SQL migrations and embeddings
JSONL into a disposable build directory, stages the migrations into
`products/polaris/site/supabase/migrations/`, and applies them with
`supabase db push`. The build is credential-free. The prose cache is committed
and `build` makes no LLM calls. Regenerating reproduces the seed byte-for-byte
(see [`data/synthetic/SEED.sha256`](data/synthetic/README.md)).

## Architecture

See [spec 1160 design](https://github.com/forwardimpact/monorepo/blob/main/specs/1160-bionova-finder-app/design-a.md)
in the Forward Impact monorepo. In short: a self-hosted Supabase stack
(PostgreSQL + pgvector, PostgREST, GoTrue, Kong, TEI embeddings) under
`infrastructure/`, a Next.js web surface and a `bionova-polaris` CLI under
`products/polaris/`, and four Deno edge functions under
`services/polaris-functions/`. Both surfaces dispatch into the same shared
`handlers/`.

## Layout

See [MONOREPO.md](MONOREPO.md).

## Operations

- [docs/deployment.md](docs/deployment.md) — local + Railway deployment, rollback, logs.
- [docs/operations.md](docs/operations.md) — re-seeding, scaling TEI, key rotation.
- [scripts/smoke.sh](scripts/smoke.sh) — verifies success criteria SC1–SC7 against a fresh stack.

## License

Apache-2.0 — see [LICENSE](LICENSE).

# BioNova Apps — Monorepo Structure

`bionova-apps` follows the [Monorepo standard](https://www.monorepo.team/): a
repository shared by humans and agents, with a fixed directory shape so both
know where everything lives.

## Shippable units

| Directory | What ships | Jobs |
| --- | --- | --- |
| `products/` | End-user products. Today: `polaris/` (patient-facing trial search). Each product owns `handlers/` (surface-agnostic logic), `cli/`, and `site/`. | [products/polaris/README.md](products/polaris/README.md) |
| `services/` | Deployable services. Today: `polaris-functions/` (Supabase Edge Functions, Deno). | [services/polaris-functions/README.md](services/polaris-functions/README.md) |

This repo consumes Forward Impact **libraries** from npm
(`@forwardimpact/libcli`, `libui`, `libformat`, `libtemplate`, `librepl`); it
does not vendor or publish any library of its own.

## Support units

| Directory | What it holds |
| --- | --- |
| `data/synthetic/` | The domain source of truth: `story.dsl` + `prose-cache.json`, vendored verbatim from the Forward Impact monorepo. The seed SQL and embeddings are **rendered locally** from these by `fit-terrain build`, never authored or committed. See [data/synthetic/README.md](data/synthetic/README.md). |
| `infrastructure/` | Self-hosted Supabase (PG On Rails) stack: one directory per Docker Compose service, plus Railway deploy config. |
| `scripts/` | Repository operations: `build-seed.sh`, `smoke.sh`, `build-fixture.sh`. |
| `docs/` | Deployment and day-2 operations docs. |
| `wiki/` | Agent memory home (deferred). |

## Root files

- `docker-compose.yml` — the full local stack.
- `setup.sh` — idempotent bootstrap: waits for services, renders + applies the
  seed, populates embeddings.
- `justfile` — common recipes (`up`, `down`, `setup`, `seed`, `cli`, `dev:site`).

## Source of truth

Auditing what the app contains means reading `data/synthetic/story.dsl` — one
legible DSL file — not reverse-engineering SQL dumps. Changing the domain means
editing the DSL in the upstream monorepo, regenerating the prose cache there,
and re-vendoring here. See spec 1160 in `forwardimpact/monorepo`.

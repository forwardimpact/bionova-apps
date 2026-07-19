# Deployment

BioNova Polaris runs as a self-hosted Supabase (PG On Rails) stack plus the
Polaris web + edge-function surfaces. Locally it runs under Docker Compose;
in production it deploys to Railway with watch-path services.

## Local

```sh
cp .env.example .env
bash scripts/build-seed.sh # render the seed JSONL FIRST — it is bind-mounted by polaris-functions
docker compose up -d --wait
./setup.sh                 # applies migrations, seeds embeddings
./scripts/smoke.sh         # verifies SC1–SC7
```

`just boot` renders the seed, brings the stack up, and runs `setup.sh`, in that
order. It does not copy `.env` or run the smoke check. The seed must exist before
`docker compose up` because the `polaris-functions` service bind-mounts
`data/synthetic/seed_embeddings.jsonl`; mounting a missing path makes Docker
create a directory there.

`build-seed.sh` runs the `fit-terrain` bin that `bun install` drops at
`node_modules/.bin/fit-terrain` from the pinned `fit-terrain` devDependency, so
no extra setup is needed. Set `FIT_TERRAIN` to a local `fit-terrain` path only
to render with an unreleased build. See
[data/synthetic/PROVENANCE.md](../data/synthetic/PROVENANCE.md).

If `docker compose up` stalls with `tei` unhealthy and its logs show
`certificate verify failed: self-signed certificate in chain`, the container
cannot download its embedding model through a TLS-inspecting proxy. Fetch the
model on the host and point `tei` at it — run `just tei-model`, set the two
`TEI_*` lines it prints in `.env`, then re-run `docker compose up -d --wait`.
See [operations.md](operations.md#loading-the-tei-model-from-a-local-copy).

Web: <http://localhost:3001/> · Kong API: <http://localhost:8000> ·
edge functions (direct): <http://localhost:8082>.

## Production (Railway)

1. Link the project once (`railway init --name bionova-apps && railway link`).
2. Set the `RAILWAY_TOKEN` repo secret.
3. Push to `main`. The `deploy.yml` workflow detects which services changed and
   runs `railway up --service=<name>` for each (watch paths in each
   `railway.toml`). See [infrastructure/railway/README.md](../infrastructure/railway/README.md).

## Rolling back

`railway rollback --service=<name>` redeploys the previous successful build.
Seed data is regenerable from the vendored DSL, so a bad migration is recovered
by reverting the commit and re-running `setup.sh` (or the destructive
`SMOKE_DESTRUCTIVE=1 scripts/smoke.sh` path) against the target DB.

## Logs

`railway logs --service=<name>` (production) or
`docker compose logs <service>` (local).

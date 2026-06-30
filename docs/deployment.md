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

`just boot` runs the first three in order. The seed must exist before
`docker compose up` because the `polaris-functions` service bind-mounts
`data/synthetic/seed_embeddings.jsonl`; mounting a missing path makes Docker
create a directory there.

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

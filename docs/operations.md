# Day-2 operations

## Re-seeding

The domain comes from `data/synthetic/story.dsl` (vendored verbatim). To
regenerate the seed locally:

```sh
bash scripts/build-seed.sh    # renders SQL + embeddings from the DSL into .build/, stages migrations
./setup.sh                    # applies migrations + re-seeds embeddings
```

`build-seed.sh` verifies the vendored DSL against `data/synthetic/SOURCE.sha256`
before rendering. It does not check the rendered output. `smoke.sh` (SC7) verifies
that against `data/synthetic/SEED.sha256`. No LLM key is needed. The prose cache is
committed.

To refresh the domain itself, change the DSL upstream in the monorepo and
re-vendor (see [data/synthetic/README.md](../data/synthetic/README.md)).

## Scaling TEI

The `tei` service is CPU-only by default (`text-embeddings-inference:cpu-1.5`).
For higher throughput, switch to a GPU image and raise the batch limits in
`docker-compose.yml`. Set them on the `command:` line, which passes
`--max-batch-tokens` and `--max-client-batch-size`. Those flags override the
matching `MAX_BATCH_TOKENS` / `MAX_CLIENT_BATCH_SIZE` environment variables, so
raising only the environment block has no effect. Embeddings are written once by
`embed-seed`; re-run it after scaling: `curl -X POST .../functions/v1/embed-seed`.

## Loading the TEI model from a local copy

On first start `tei` downloads `BAAI/bge-small-en-v1.5` from huggingface.co into
the `tei-data` volume. On a network that intercepts TLS (a proxy whose CA the
container does not trust), that download fails with `certificate verify failed:
self-signed certificate in chain`, and because `polaris-functions` waits for
`tei` to be healthy the whole stack stalls.

Fetch the model on the host (which usually does trust the proxy CA) and point
`tei` at it:

```bash
just tei-model          # downloads to ~/.cache/bionova-tei-model/bge-small-en-v1.5
```

Then set the two lines it prints in `.env` and recreate the service:

```
TEI_MODEL_ID=/data
TEI_MODEL_SOURCE=/absolute/path/to/bge-small-en-v1.5
```

```bash
docker compose up -d tei
```

`TEI_MODEL_SOURCE` bind-mounts the host directory at `/data` and `TEI_MODEL_ID`
tells `tei` to load that path instead of downloading. Leave both unset for the
default download behavior.

## Rotating the service-role key

1. Regenerate the JWT and update `SERVICE_ROLE_KEY` (and the matching Kong
   `key-auth` credential in `infrastructure/kong/kong.yml`).
2. Re-run `setup.sh` so the DB setting `app.service_role_key` (read by the
   notify-updates trigger and the sync-listings cron) is refreshed.

## Refreshing the eligibility fixture

The smoke script's matching-patient payload
(`scripts/fixtures/eligible-patient.json`) is generated from the live DB:

```sh
./setup.sh && bash scripts/build-fixture.sh
```

Re-run and commit the regenerated fixture whenever the seed criteria change.

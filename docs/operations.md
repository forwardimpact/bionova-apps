# Day-2 operations

## Re-seeding

The domain comes from `data/synthetic/story.dsl` (vendored verbatim). To
regenerate the seed locally:

```sh
bash scripts/build-seed.sh    # renders SQL + embeddings from the DSL into .build/, stages migrations
./setup.sh                    # applies migrations + re-seeds embeddings
```

`build-seed.sh` verifies the vendored DSL against `data/synthetic/SOURCE.sha256`
and the rendered output against `data/synthetic/SEED.sha256` before staging. No
LLM key is needed — the prose cache is committed.

To refresh the domain itself, change the DSL upstream in the monorepo and
re-vendor (see [data/synthetic/README.md](../data/synthetic/README.md)).

## Scaling TEI

The `tei` service is CPU-only by default (`text-embeddings-inference:cpu-1.5`).
For higher throughput, switch to a GPU image and raise `MAX_BATCH_TOKENS` /
`MAX_CLIENT_BATCH_SIZE` in `docker-compose.yml`. Embeddings are written once by
`embed-seed`; re-run it after scaling: `curl -X POST .../functions/v1/embed-seed`.

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

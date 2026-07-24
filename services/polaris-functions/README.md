# polaris-functions

Supabase Edge Functions (Deno) served through Kong at `/functions/v1/{name}`.

| Function            | Trigger                       | What it does                                                                                                |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `embed-seed`        | `setup.sh`, once              | reads the seed embeddings JSONL, calls TEI for each condition's vector, upserts into `condition_embeddings` |
| `eligibility-check` | screener POST (web/CLI)       | evaluates a patient's answers against a trial's `criteria` and returns a match score                        |
| `notify-updates`    | DB trigger on `trials.status` | logs a would-notify line for each interested signal (email deferred)                                        |
| `sync-listings`     | `pg_cron` or manual           | re-reads the staged trial/criteria SQL and upserts every row                                                |

## Local invocation

With the stack up:

```sh
curl http://localhost:8082/health
curl -X POST http://localhost:8082/eligibility-check -d '{"trial_id":"…"}'
```

Through Kong (requires the `apikey` header):

```sh
curl -X POST http://localhost:8000/functions/v1/sync-listings \
  -H "apikey: $SERVICE_ROLE_KEY" -d '{"dry_run":true}'
```

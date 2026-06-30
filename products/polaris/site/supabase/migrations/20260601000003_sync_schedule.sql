-- Daily sync-listings schedule. Reuses app.service_role_key (set by setup.sh)
-- for the Kong apikey/Authorization headers. pg_cron and pg_net are created in
-- part 01. The postgres container runs UTC (TZ=UTC in compose), so 03:00 here
-- is 03:00 UTC. Unschedule first so the migration is idempotent on re-apply.

SELECT cron.unschedule('sync-listings-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-listings-daily');

SELECT cron.schedule(
  'sync-listings-daily',
  '0 3 * * *',
  $$SELECT net.http_post(
    url := 'http://kong:8000/functions/v1/sync-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', current_setting('app.service_role_key', true),
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );$$
);

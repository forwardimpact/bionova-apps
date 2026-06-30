-- notify-updates trigger. When a trial's status changes, call the
-- notify-updates edge function through Kong. Kong requires an apikey header on
-- /functions/v1/* routes, so the function reads the service-role key from the
-- app.service_role_key database setting populated by setup.sh:
--   ALTER DATABASE postgres SET app.service_role_key = '<key>';
-- net.http_post comes from the pg_net extension (created in part 01).

CREATE OR REPLACE FUNCTION public.notify_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_key text := current_setting('app.service_role_key', true);
BEGIN
  PERFORM net.http_post(
    url := 'http://kong:8000/functions/v1/notify-updates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key,
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'trial_id', NEW.id,
      'old_status', OLD.status,
      'new_status', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trials_status_change_notify ON trials;

CREATE TRIGGER trials_status_change_notify
AFTER UPDATE OF status ON trials
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_status_change();

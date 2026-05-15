-- Schedule early-warning edge function daily at 06:00 EAT (03:00 UTC)
-- Uses pg_net to POST to the deployed Supabase edge function.
-- pg_cron must be enabled on the project (default on Supabase Pro).

SELECT cron.schedule(
  'early-warning-daily',
  '0 3 * * *',   -- 03:00 UTC = 06:00 EAT
  $$
    SELECT net.http_post(
      url    := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/early-warning',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Schedule weekly seating analysis via pg_cron + pg_net
-- Runs every Sunday at 20:00 UTC (= 11:00 PM EAT)
-- Calls the run-seating-analysis edge function with service-role auth

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove previous schedule if it exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-seating-analysis');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'weekly-seating-analysis',
  '0 20 * * 0',
  $$
  SELECT
    net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/run-seating-analysis',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

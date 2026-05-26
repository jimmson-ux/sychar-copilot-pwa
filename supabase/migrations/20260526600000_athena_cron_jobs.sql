-- ================================================================
-- ATHENA CRON JOBS — 2026-05-26
--
-- Schedules the three Athena sprint edge functions:
--   analyze-consumption    — Monday 06:00 EAT (03:00 UTC)
--   daily-attendance-summary — Weekdays 15:30 EAT (12:30 UTC)
--   weekly-syllabus-check  — Friday 16:00 EAT (13:00 UTC)
--
-- NOTE: CRON_SECRET must be set as an edge function secret in Supabase.
-- All three functions validate x-cron-secret before executing.
-- ================================================================

-- Remove stale jobs if re-running
SELECT cron.unschedule('analyze-consumption-weekly')  WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'analyze-consumption-weekly'
);
SELECT cron.unschedule('daily-attendance-summary')     WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-attendance-summary'
);
SELECT cron.unschedule('weekly-syllabus-check')        WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-syllabus-check'
);

-- analyze-consumption: Monday 06:00 EAT = 03:00 UTC
SELECT cron.schedule(
  'analyze-consumption-weekly',
  '0 3 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/analyze-consumption',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-cron-secret',  current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- daily-attendance-summary: Weekdays 15:30 EAT = 12:30 UTC
SELECT cron.schedule(
  'daily-attendance-summary',
  '30 12 * * 1-5',
  $$
    SELECT net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/daily-attendance-summary',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-cron-secret',  current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- weekly-syllabus-check: Friday 16:00 EAT = 13:00 UTC
SELECT cron.schedule(
  'weekly-syllabus-check',
  '0 13 * * 5',
  $$
    SELECT net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/weekly-syllabus-check',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-cron-secret',  current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- ================================================================
-- Fix pg_cron edge function calls
--
-- Previous cron schedules used current_setting('app.service_role_key')
-- which was never set → cron calls returned 401 silently.
--
-- Fix: functions now deployed with verify_jwt=false and authenticate
-- via x-cron-secret header (same value as CRON_SECRET edge-fn secret).
-- ================================================================

-- ── Reschedule morning-brief (weekdays 07:30 EAT = 04:30 UTC) ─────────────
SELECT cron.unschedule('morning-brief');

SELECT cron.schedule(
  'morning-brief',
  '30 4 * * 1-5',
  $$
    SELECT net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/morning-brief',
      headers := '{"Content-Type":"application/json","x-cron-secret":"F3jg5FyEwY3SDLUr7adMzWStUbSTKCU7rugpd8zS8/E="}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── Reschedule early-warning-daily (06:00 EAT = 03:00 UTC) ───────────────
SELECT cron.unschedule('early-warning-daily');

SELECT cron.schedule(
  'early-warning-daily',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/early-warning',
      headers := '{"Content-Type":"application/json","x-cron-secret":"F3jg5FyEwY3SDLUr7adMzWStUbSTKCU7rugpd8zS8/E="}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── Reschedule nightly-insights (22:00 EAT = 19:00 UTC) ──────────────────
SELECT cron.unschedule('nightly-insights');

SELECT cron.schedule(
  'nightly-insights',
  '0 19 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/ai-insights',
      headers := '{"Content-Type":"application/json","x-cron-secret":"F3jg5FyEwY3SDLUr7adMzWStUbSTKCU7rugpd8zS8/E="}'::jsonb,
      body    := '{"insightType":"school_snapshot","context":"nightly_batch"}'::jsonb
    )
    FROM public.schools
    WHERE is_active = true;
  $$
);

-- ============================================================
-- Sychar Copilot — Log Maintenance
-- safe to re-run (CREATE OR REPLACE throughout)
-- ============================================================

-- ── FUNCTION 1: clean_old_logs ───────────────────────────────
-- Deletes system_logs rows older than 7 days.
-- Called by the nightly cron job below.

CREATE OR REPLACE FUNCTION public.clean_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.system_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$;

COMMENT ON FUNCTION public.clean_old_logs() IS
  'Purges system_logs rows older than 7 days. '
  'Scheduled nightly via pg_cron at 00:00 UTC.';


-- ── FUNCTION 2: get_log_stats ────────────────────────────────
-- Returns a single-row health summary of the system_logs table.
-- Useful for the super-admin dashboard.

CREATE OR REPLACE FUNCTION public.get_log_stats()
RETURNS TABLE (
  total_logs              BIGINT,
  error_count             BIGINT,
  warning_count           BIGINT,
  logs_last_24h           BIGINT,
  most_recent_error       TEXT,
  most_affected_school_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      COUNT(*)                                                 AS total_logs,
      COUNT(*) FILTER (WHERE level IN ('error', 'critical'))  AS error_count,
      COUNT(*) FILTER (WHERE level = 'warning')               AS warning_count,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS logs_last_24h
    FROM public.system_logs
  ),
  recent_error AS (
    SELECT message
    FROM   public.system_logs
    WHERE  level IN ('error', 'critical')
    ORDER  BY created_at DESC
    LIMIT  1
  ),
  top_school AS (
    SELECT   school_id
    FROM     public.system_logs
    WHERE    level IN ('error', 'critical')
      AND    created_at > NOW() - INTERVAL '24 hours'
      AND    school_id IS NOT NULL
    GROUP BY school_id
    ORDER BY COUNT(*) DESC
    LIMIT  1
  )
  SELECT
    b.total_logs,
    b.error_count,
    b.warning_count,
    b.logs_last_24h,
    re.message       AS most_recent_error,
    ts.school_id     AS most_affected_school_id
  FROM       base b
  LEFT JOIN  recent_error re ON true
  LEFT JOIN  top_school   ts ON true;
END;
$$;

COMMENT ON FUNCTION public.get_log_stats() IS
  'Returns a single-row health summary: totals, error/warning counts, '
  'last-24-hour activity, most recent error message, and the school '
  'with the most errors in the past 24 hours.';


-- ── CRON REGISTRATION ────────────────────────────────────────
-- Requires the pg_cron extension (enable in Supabase dashboard →
-- Database → Extensions → pg_cron).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove any existing schedule with this name before re-adding,
    -- so re-running this migration is always safe.
    PERFORM cron.unschedule('sychar-clean-logs');

    PERFORM cron.schedule(
      'sychar-clean-logs',   -- job name
      '0 0 * * *',           -- every day at 00:00 UTC
      'SELECT public.clean_old_logs()'
    );

    RAISE NOTICE 'pg_cron job "sychar-clean-logs" scheduled at 00:00 UTC daily.';
  ELSE
    RAISE NOTICE
      'pg_cron is not enabled. To activate the nightly log-cleanup job, '
      'go to Supabase Dashboard → Database → Extensions and enable pg_cron, '
      'then re-run this migration.';
  END IF;
END;
$$;

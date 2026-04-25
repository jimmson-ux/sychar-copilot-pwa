-- Phase 6 — Communication & Intelligence tables

-- ── emergency_broadcasts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.emergency_broadcasts (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  broadcast_type  text NOT NULL
    CHECK (broadcast_type IN ('school_closure','lockdown','health_emergency',
                              'government_directive','infrastructure','natural_disaster')),
  message         text NOT NULL,
  target_audience text NOT NULL CHECK (target_audience IN ('all_parents','all_staff','both')),
  recipient_count integer DEFAULT 0,
  sms_count       integer DEFAULT 0,
  confirmed_count integer DEFAULT 0,
  sent_by         uuid,
  sent_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.emergency_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emergency_broadcasts_school" ON public.emergency_broadcasts;
CREATE POLICY "emergency_broadcasts_school" ON public.emergency_broadcasts
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_emergency_broadcasts_school
  ON public.emergency_broadcasts(school_id, sent_at DESC);

-- ── staffing_analytics ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staffing_analytics (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id               uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year           text NOT NULL,
  term                    integer NOT NULL,
  computed_at             timestamptz DEFAULT now(),
  total_teaching_staff    integer,
  total_periods_per_week  integer,
  staff_with_overload     integer,
  ghost_subjects          jsonb DEFAULT '[]',
  out_of_field_count      integer,
  substitution_strain     integer,
  analytics_data          jsonb DEFAULT '{}',
  UNIQUE (school_id, academic_year, term)
);

ALTER TABLE public.staffing_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staffing_school" ON public.staffing_analytics;
CREATE POLICY "staffing_school" ON public.staffing_analytics
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── compute_staffing_analytics function ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_staffing_analytics(p_school_id UUID)
RETURNS void AS $$
DECLARE
  v_academic_year text;
  v_term          integer;
  v_month         integer;
BEGIN
  v_month := EXTRACT(MONTH FROM now())::integer;
  v_term  := CASE WHEN v_month <= 4 THEN 1 WHEN v_month <= 8 THEN 2 ELSE 3 END;

  BEGIN
    SELECT
      COALESCE(ss.current_academic_year::text, EXTRACT(YEAR FROM now())::text),
      COALESCE(ss.current_term::integer, v_term)
    INTO v_academic_year, v_term
    FROM public.school_settings ss
    WHERE ss.school_id = p_school_id
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_academic_year := EXTRACT(YEAR FROM now())::text;
  END;

  IF v_academic_year IS NULL THEN
    v_academic_year := EXTRACT(YEAR FROM now())::text;
  END IF;

  INSERT INTO public.staffing_analytics (
    school_id, academic_year, term, computed_at,
    total_teaching_staff, analytics_data
  )
  SELECT
    p_school_id,
    v_academic_year,
    v_term,
    now(),
    COUNT(DISTINCT sr.id),
    jsonb_build_object('computed_at', now()::text)
  FROM public.staff_records sr
  WHERE sr.school_id = p_school_id
    AND (sr.is_active = true OR sr.active = true)
  ON CONFLICT (school_id, academic_year, term)
  DO UPDATE SET
    computed_at          = now(),
    total_teaching_staff = EXCLUDED.total_teaching_staff,
    analytics_data       = EXCLUDED.analytics_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── pg_cron jobs ──────────────────────────────────────────────────────────────

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Nightly staffing analytics (9 PM EAT = 18:00 UTC)
    PERFORM cron.schedule(
      'nightly-staffing-analytics',
      '0 18 * * *',
      $cron$
        SELECT public.compute_staffing_analytics(id)
        FROM public.schools
        WHERE is_active = true;
      $cron$
    );

    -- Morning brief trigger (7:30 AM EAT = 4:30 UTC, weekdays)
    PERFORM cron.schedule(
      'morning-brief',
      '30 4 * * 1-5',
      $cron$
        SELECT net.http_post(
          url     := current_setting('app.supabase_url') || '/functions/v1/morning-brief',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
            'Content-Type',  'application/json'
          ),
          body := '{}'::jsonb
        );
      $cron$
    );

  END IF;
END
$outer$;

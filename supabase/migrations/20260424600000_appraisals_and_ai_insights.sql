-- Phase 6 — Ensure appraisals and ai_insights tables exist with full schema
-- Both tables were referenced by RLS policies in earlier migrations
-- but their CREATE TABLE was never tracked. Fully idempotent.

-- ── appraisals ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.appraisals (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  appraisee_id     uuid NOT NULL,
  graded_by        uuid,
  appraisal_type   text NOT NULL DEFAULT 'duty',
  duty_date        date,
  punctuality      integer,
  incident_handling integer,
  report_quality   integer,
  student_welfare  integer,
  overall_rating   text,
  duty_notes       text,
  graded_via       text DEFAULT 'manual',
  created_at       timestamptz DEFAULT now()
);

-- Add columns that may be missing in the live table
ALTER TABLE public.appraisals
  ADD COLUMN IF NOT EXISTS graded_by       uuid,
  ADD COLUMN IF NOT EXISTS appraisal_type  text NOT NULL DEFAULT 'duty',
  ADD COLUMN IF NOT EXISTS duty_date       date,
  ADD COLUMN IF NOT EXISTS punctuality     integer,
  ADD COLUMN IF NOT EXISTS incident_handling integer,
  ADD COLUMN IF NOT EXISTS report_quality  integer,
  ADD COLUMN IF NOT EXISTS student_welfare integer,
  ADD COLUMN IF NOT EXISTS overall_rating  text,
  ADD COLUMN IF NOT EXISTS duty_notes      text,
  ADD COLUMN IF NOT EXISTS graded_via      text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_appraisals_school
  ON public.appraisals(school_id, duty_date DESC);
CREATE INDEX IF NOT EXISTS idx_appraisals_appraisee
  ON public.appraisals(school_id, appraisee_id);

ALTER TABLE public.appraisals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appraisals_school_isolation" ON public.appraisals;
CREATE POLICY "appraisals_school_isolation" ON public.appraisals
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── ai_insights ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_insights (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    uuid NOT NULL,
  generated_by uuid,
  insight_type text NOT NULL,
  target_type  text,
  content      text NOT NULL,
  severity     text DEFAULT 'info',
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

-- Add columns that may be missing in the live table
ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS generated_by uuid,
  ADD COLUMN IF NOT EXISTS target_type  text,
  ADD COLUMN IF NOT EXISTS severity     text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS metadata     jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_insights_school
  ON public.ai_insights(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type
  ON public.ai_insights(school_id, insight_type, created_at DESC);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_insights_school_isolation" ON public.ai_insights;
CREATE POLICY "ai_insights_school_isolation" ON public.ai_insights
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── nightly insights cron (10 PM EAT = 19:00 UTC) ────────────────────────────

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    PERFORM cron.schedule(
      'nightly-insights',
      '0 19 * * *',
      $cron$
        SELECT net.http_post(
          url     := current_setting('app.supabase_url') || '/functions/v1/ai-insights',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
            'Content-Type',  'application/json'
          ),
          body := jsonb_build_object('insightType', 'school_snapshot', 'context', 'nightly_batch')
        )
        FROM public.schools
        WHERE is_active = true;
      $cron$
    );

  END IF;
END
$outer$;

-- ============================================================
-- Analytics Schema — mark_breakdowns, analytics_cache,
-- fee_payment_patterns, student baseline columns,
-- report_card_jobs, and cache-refresh trigger.
--
-- Uses TEXT for term (matches marks.term convention) and
-- get_my_school_id() for RLS (project standard).
-- ============================================================

-- ── mark_breakdowns ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mark_breakdowns (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid    NOT NULL,
  mark_id         uuid    REFERENCES public.marks(id) ON DELETE CASCADE,
  student_id      uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id      uuid    NOT NULL,
  class_id        uuid,
  class_name      text,
  stream_name     text,
  term            text    NOT NULL,
  academic_year   text,
  exam_type       varchar(50) NOT NULL,
  question_number int     NOT NULL,
  topic_tag       varchar(100) NOT NULL,
  marks_scored    decimal(5,2) NOT NULL,
  marks_possible  decimal(5,2) NOT NULL,
  percentage      decimal(5,2) GENERATED ALWAYS AS
                  (CASE WHEN marks_possible > 0
                   THEN ROUND((marks_scored / marks_possible * 100)::numeric, 2)
                   ELSE 0 END) STORED,
  curriculum_type varchar(10) NOT NULL DEFAULT '844',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mb_school_subject ON public.mark_breakdowns(school_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_mb_student        ON public.mark_breakdowns(student_id);
CREATE INDEX IF NOT EXISTS idx_mb_topic          ON public.mark_breakdowns(school_id, topic_tag);

ALTER TABLE public.mark_breakdowns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='mark_breakdowns' AND policyname='mb_school_isolation') THEN
    CREATE POLICY "mb_school_isolation" ON public.mark_breakdowns
      FOR ALL TO authenticated
      USING (school_id = public.get_my_school_id())
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── student baseline columns ──────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS kcpe_marks         decimal(5,2),
  ADD COLUMN IF NOT EXISTS kpsea_marks        decimal(5,2),
  ADD COLUMN IF NOT EXISTS admission_baseline decimal(5,2),
  ADD COLUMN IF NOT EXISTS baseline_type      varchar(10);

COMMENT ON COLUMN public.students.baseline_type IS
  'KCPE for 8-4-4 students (max 500), KPSEA for CBC (max 100)';

-- ── analytics_cache ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_cache (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid    NOT NULL,
  cache_key   varchar(200) NOT NULL,
  payload     jsonb   NOT NULL,
  computed_at timestamptz  DEFAULT now(),
  CONSTRAINT unique_cache_key UNIQUE (school_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_ac_school_key ON public.analytics_cache(school_id, cache_key);

ALTER TABLE public.analytics_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='analytics_cache' AND policyname='ac_school_isolation') THEN
    CREATE POLICY "ac_school_isolation" ON public.analytics_cache
      FOR ALL TO authenticated
      USING (school_id = public.get_my_school_id())
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── fee_payment_patterns ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fee_payment_patterns (
  id                   uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id            uuid    NOT NULL,
  student_id           uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term                 text    NOT NULL,
  academic_year        text,
  payment_week         int     NOT NULL CHECK (payment_week BETWEEN 1 AND 13),
  cumulative_paid      decimal(10,2) NOT NULL DEFAULT 0,
  payment_count        int     NOT NULL DEFAULT 0,
  is_installment_payer boolean DEFAULT false,
  computed_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fpp_school     ON public.fee_payment_patterns(school_id);
CREATE INDEX IF NOT EXISTS idx_fpp_student    ON public.fee_payment_patterns(student_id);

ALTER TABLE public.fee_payment_patterns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='fee_payment_patterns' AND policyname='fpp_school_isolation') THEN
    CREATE POLICY "fpp_school_isolation" ON public.fee_payment_patterns
      FOR ALL TO authenticated
      USING (school_id = public.get_my_school_id())
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── report_card_jobs ──────────────────────────────────────────
-- Tracks async report card generation. Polled by the UI.
CREATE TABLE IF NOT EXISTS public.report_card_jobs (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid    NOT NULL,
  created_by       uuid    NOT NULL,
  status           text    NOT NULL DEFAULT 'processing'
                           CHECK (status IN ('processing','complete','failed')),
  progress         int     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  report_count     int     NOT NULL DEFAULT 0,
  cbc_count        int     NOT NULL DEFAULT 0,
  legacy_count     int     NOT NULL DEFAULT 0,
  download_url     text,
  error_message    text,
  class_id         uuid,
  stream_id        uuid,
  term             text    NOT NULL,
  academic_year    text,
  created_at       timestamptz DEFAULT now(),
  completed_at     timestamptz
);

ALTER TABLE public.report_card_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='report_card_jobs' AND policyname='rcj_school_isolation') THEN
    CREATE POLICY "rcj_school_isolation" ON public.report_card_jobs
      FOR ALL TO authenticated
      USING (school_id = public.get_my_school_id())
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── analytics cache invalidation trigger ─────────────────────
-- Runs after any marks INSERT or UPDATE; purges stale cache
-- entries for the affected subject, plus global school_mean
-- and at_risk caches so they are recomputed on next request.

CREATE OR REPLACE FUNCTION public.refresh_analytics_cache()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.analytics_cache
  WHERE school_id = NEW.school_id
    AND (
      cache_key LIKE '%' || COALESCE(NEW.subject_id::text, '') || '%'
      OR cache_key LIKE '%school_mean%'
      OR cache_key LIKE '%at_risk%'
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_refresh_analytics ON public.marks;
CREATE TRIGGER trigger_refresh_analytics
  AFTER INSERT OR UPDATE ON public.marks
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_analytics_cache();

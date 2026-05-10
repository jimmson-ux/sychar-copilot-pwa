-- ══════════════════════════════════════════════════════════════════
-- 20260510200000_timetable_intelligence_rpcs.sql
--
-- Three intelligence RPCs that feed the AI timetable generator:
--   1. get_teacher_attendance_stats   — punctuality / reliability
--   2. get_teacher_subject_performance — student outcome per teacher/subject
--   3. get_teacher_appraisal_scores   — duty appraisal ratings
--
-- Plus: duty_roster table for AI-generated duty assignments
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Rolling attendance reliability per teacher ─────────────────
CREATE OR REPLACE FUNCTION public.get_teacher_attendance_stats(
  p_school_id uuid,
  p_days_back  integer DEFAULT 90
)
RETURNS TABLE(
  teacher_id        text,
  teacher_name      text,
  total_lessons     bigint,
  on_time           bigint,
  late_count        bigint,
  absent_count      bigint,
  left_early_count  bigint,
  avg_late_minutes  numeric,
  punctuality_pct   numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    tas.teacher_id::text,
    tas.teacher_name,
    COUNT(*)                                                            AS total_lessons,
    COUNT(*) FILTER (WHERE tas.status = 'present')                     AS on_time,
    COUNT(*) FILTER (WHERE tas.status = 'late')                        AS late_count,
    COUNT(*) FILTER (WHERE tas.status = 'absent')                      AS absent_count,
    COUNT(*) FILTER (WHERE tas.status = 'left_early')                  AS left_early_count,
    ROUND(
      AVG(tas.late_minutes) FILTER (WHERE tas.status = 'late'), 1
    )                                                                   AS avg_late_minutes,
    ROUND(
      COUNT(*) FILTER (WHERE tas.status = 'present')::numeric
      / NULLIF(COUNT(*), 0) * 100, 1
    )                                                                   AS punctuality_pct
  FROM public.teacher_attendance_scans tas
  WHERE tas.school_id::text = p_school_id::text
    AND tas.scan_date >= (CURRENT_DATE - (p_days_back || ' days')::interval)
  GROUP BY tas.teacher_id, tas.teacher_name
  ORDER BY punctuality_pct DESC NULLS LAST;
$$;

-- ── 2. Student outcome per teacher × subject × class ─────────────
CREATE OR REPLACE FUNCTION public.get_teacher_subject_performance(
  p_school_id     uuid,
  p_term          text DEFAULT NULL,
  p_academic_year text DEFAULT NULL
)
RETURNS TABLE(
  teacher_id    text,
  teacher_name  text,
  subject_name  text,
  class_name    text,
  avg_score     numeric,
  avg_pct       numeric,
  record_count  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    sp.teacher_id::text,
    sr.full_name                                                        AS teacher_name,
    sp.subject_name,
    sp.class_name,
    ROUND(AVG(sp.score), 1)                                             AS avg_score,
    ROUND(AVG(sp.score) / NULLIF(AVG(sp.out_of), 0) * 100, 1)         AS avg_pct,
    COUNT(*)                                                            AS record_count
  FROM public.subject_performance sp
  JOIN public.staff_records sr
    ON sr.id::text = sp.teacher_id::text
  WHERE sp.school_id::text = p_school_id::text
    AND (p_term          IS NULL OR sp.term::text          = p_term)
    AND (p_academic_year IS NULL OR sp.academic_year::text = p_academic_year)
  GROUP BY sp.teacher_id, sr.full_name, sp.subject_name, sp.class_name
  ORDER BY avg_pct DESC NULLS LAST;
$$;

-- ── 3. Duty & welfare appraisal scores per teacher ───────────────
CREATE OR REPLACE FUNCTION public.get_teacher_appraisal_scores(
  p_school_id uuid
)
RETURNS TABLE(
  teacher_id             text,
  teacher_name           text,
  avg_punctuality        numeric,
  avg_incident_handling  numeric,
  avg_report_quality     numeric,
  avg_student_welfare    numeric,
  appraisal_count        bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.appraisee_id::text,
    sr.full_name                              AS teacher_name,
    ROUND(AVG(a.punctuality), 1)              AS avg_punctuality,
    ROUND(AVG(a.incident_handling), 1)        AS avg_incident_handling,
    ROUND(AVG(a.report_quality), 1)           AS avg_report_quality,
    ROUND(AVG(a.student_welfare), 1)          AS avg_student_welfare,
    COUNT(*)                                  AS appraisal_count
  FROM public.appraisals a
  JOIN public.staff_records sr
    ON sr.id::text = a.appraisee_id::text
  WHERE a.school_id::text = p_school_id::text
  GROUP BY a.appraisee_id, sr.full_name
  ORDER BY avg_punctuality DESC NULLS LAST;
$$;

-- ── 4. Duty roster table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.duty_roster (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id     uuid        NOT NULL REFERENCES public.schools(id),
  teacher_id    text        NOT NULL,
  teacher_name  text        NOT NULL,
  duty_date     date        NOT NULL,
  day_of_week   integer     NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  duty_type     text        NOT NULL DEFAULT 'break_supervision',
  shift_start   time        NOT NULL,
  shift_end     time        NOT NULL,
  location      text,
  notes         text,
  week_start    date,
  ai_generated  boolean     DEFAULT true,
  created_by    uuid        REFERENCES public.staff_records(id),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.duty_roster
  ADD COLUMN IF NOT EXISTS school_id    uuid,
  ADD COLUMN IF NOT EXISTS teacher_id   text,
  ADD COLUMN IF NOT EXISTS teacher_name text,
  ADD COLUMN IF NOT EXISTS duty_date    date,
  ADD COLUMN IF NOT EXISTS day_of_week  integer,
  ADD COLUMN IF NOT EXISTS duty_type    text,
  ADD COLUMN IF NOT EXISTS shift_start  time,
  ADD COLUMN IF NOT EXISTS shift_end    time,
  ADD COLUMN IF NOT EXISTS location     text,
  ADD COLUMN IF NOT EXISTS notes        text,
  ADD COLUMN IF NOT EXISTS week_start   date,
  ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by   uuid,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_teacher_date_type
  ON public.duty_roster (school_id, teacher_id, duty_date, duty_type);

CREATE INDEX IF NOT EXISTS idx_duty_school_week
  ON public.duty_roster (school_id, week_start);

ALTER TABLE public.duty_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "duty_deputy_all"   ON public.duty_roster;
DROP POLICY IF EXISTS "duty_teacher_read" ON public.duty_roster;
DROP POLICY IF EXISTS "duty_service"      ON public.duty_roster;

-- Deputy/Dean/Principal can manage all roster entries for their school
CREATE POLICY "duty_deputy_all" ON public.duty_roster
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

-- Teachers can view their own duty assignments
CREATE POLICY "duty_teacher_read" ON public.duty_roster
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND teacher_id::text IN (
      SELECT id::text FROM public.staff_records
      WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "duty_service" ON public.duty_roster
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime for live deputy/principal dashboard
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'duty_roster'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.duty_roster;
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE 'get_teacher_attendance_stats fn: 1';
  RAISE NOTICE 'get_teacher_subject_performance fn: 1';
  RAISE NOTICE 'get_teacher_appraisal_scores fn: 1';
  RAISE NOTICE 'duty_roster table: 1';
END $$;

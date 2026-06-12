-- ================================================================
-- TEACHER ON DUTY — DAILY REPORT (+ nagging reminder support)
-- 2026-06-12
--
-- Captures the synthesized end-of-day TOD checklist. The tod-reminder cron nags
-- the on-duty teacher if the day's report is unfilled by the cutoff and escalates
-- an unfilled-summary to the deputy & principal.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tod_daily_report (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  teacher_id      uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  duty_date       date        NOT NULL,
  shift           text        DEFAULT 'Day' CHECK (shift IN ('Day','Night')),
  -- Full filled checklist (sections from src/lib/templates/tod.ts) as JSONB:
  report          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at    timestamptz,
  signature       text,       -- auto digital signature on submit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, teacher_id, duty_date, shift)
);

CREATE INDEX IF NOT EXISTS idx_tod_daily_report_school_date
  ON public.tod_daily_report (school_id, duty_date DESC);

ALTER TABLE public.tod_daily_report ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tod_report_own       ON public.tod_daily_report;
DROP POLICY IF EXISTS tod_report_leadership ON public.tod_daily_report;
DROP POLICY IF EXISTS tod_report_service   ON public.tod_daily_report;

-- Duty teacher manages their own report.
CREATE POLICY tod_report_own ON public.tod_daily_report
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND teacher_id IN (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text)
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND teacher_id IN (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text)
  );

-- Leadership reads all reports for the school.
CREATE POLICY tod_report_leadership ON public.tod_daily_report
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_admin','super_admin')
  );

CREATE POLICY tod_report_service ON public.tod_daily_report
  FOR ALL TO service_role USING (true) WITH CHECK (true);

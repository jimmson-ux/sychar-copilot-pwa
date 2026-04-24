-- Phase 3 Financial Modules schema additions
-- Adds: daily_rate + employment_type to staff_records,
--       nts_payroll, nts_attendance_log, kemis_exports, ministry_circulars tables.

-- ── staff_records additions ───────────────────────────────────────────────────

ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS daily_rate       NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employment_type  TEXT DEFAULT 'TSC'
    CHECK (employment_type IN ('TSC', 'BOM', 'NTS', 'contract')),
  ADD COLUMN IF NOT EXISTS kra_pin          TEXT,
  ADD COLUMN IF NOT EXISTS bank_account     TEXT,
  ADD COLUMN IF NOT EXISTS phone_number     TEXT,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT true;

-- ── nts_payroll ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nts_payroll (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id          text NOT NULL,
  month             text NOT NULL,
  days_worked       integer NOT NULL DEFAULT 0,
  daily_rate        numeric(10,2) NOT NULL DEFAULT 0,
  gross             numeric(12,2) NOT NULL DEFAULT 0,
  paye              numeric(10,2) NOT NULL DEFAULT 0,
  nssf              numeric(10,2) NOT NULL DEFAULT 0,
  shif              numeric(10,2) NOT NULL DEFAULT 0,
  ahl               numeric(10,2) NOT NULL DEFAULT 0,
  total_deductions  numeric(12,2) NOT NULL DEFAULT 0,
  net               numeric(12,2) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  approved_by       text,
  approved_at       timestamptz,
  pdf_url           text,
  generated_at      timestamptz DEFAULT now()
);

-- Add columns that may be missing from pre-migration table
ALTER TABLE public.nts_payroll
  ADD COLUMN IF NOT EXISTS year             text,
  ADD COLUMN IF NOT EXISTS total_deductions numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pdf_url          text,
  ADD COLUMN IF NOT EXISTS ahl              numeric(10,2) DEFAULT 0;

ALTER TABLE public.nts_payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nts_payroll_school" ON public.nts_payroll;
CREATE POLICY "nts_payroll_school" ON public.nts_payroll
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- Index on columns that are guaranteed to exist
CREATE INDEX IF NOT EXISTS idx_nts_payroll_school ON public.nts_payroll(school_id, month);

-- ── nts_attendance_log ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nts_attendance_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id    text NOT NULL,                       -- staff_records.id
  date        date NOT NULL,
  status      text NOT NULL DEFAULT 'IN'
    CHECK (status IN ('IN', 'ABSENT', 'HALF', 'LEAVE')),
  check_in    time,
  check_out   time,
  notes       text,
  recorded_by text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (school_id, staff_id, date)
);

ALTER TABLE public.nts_attendance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nts_attendance_school" ON public.nts_attendance_log;
CREATE POLICY "nts_attendance_school" ON public.nts_attendance_log
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_nts_attendance_school_date
  ON public.nts_attendance_log(school_id, staff_id, date);

-- ── kemis_exports ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kemis_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exported_by   text NOT NULL,
  record_count  integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  exported_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kemis_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kemis_exports_school" ON public.kemis_exports;
CREATE POLICY "kemis_exports_school" ON public.kemis_exports
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── ministry_circulars ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ministry_circulars (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  file_url          text NOT NULL,
  source            text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('whatsapp', 'gmail', 'manual', 'scanner')),
  gemini_extracted  jsonb,
  claude_summary    text,
  confidence_score  numeric(4,3) DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'reviewed', 'applied', 'dismissed')),
  uploaded_by       text NOT NULL,
  applied_by        text,
  applied_at        timestamptz,
  created_at        timestamptz DEFAULT now()
);

-- Add columns that may be missing from pre-migration table
ALTER TABLE public.ministry_circulars
  ADD COLUMN IF NOT EXISTS file_url          text,
  ADD COLUMN IF NOT EXISTS source            text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS gemini_extracted  jsonb,
  ADD COLUMN IF NOT EXISTS claude_summary    text,
  ADD COLUMN IF NOT EXISTS confidence_score  numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status            text DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS uploaded_by       text,
  ADD COLUMN IF NOT EXISTS applied_by        text,
  ADD COLUMN IF NOT EXISTS applied_at        timestamptz,
  ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now();

ALTER TABLE public.ministry_circulars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ministry_circulars_school" ON public.ministry_circulars;
CREATE POLICY "ministry_circulars_school" ON public.ministry_circulars
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_ministry_circulars_school
  ON public.ministry_circulars(school_id, created_at DESC);

-- ── Weekly cron: remind principal to check unreviewed circulars ───────────────
-- Requires pg_cron extension to be enabled in Supabase project.
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'document-inbox-reminder',
      '0 8 * * 1',
      $cron$
        INSERT INTO public.notices (school_id, title, content, target_audience, created_at)
        SELECT school_id,
               'Ministry Inbox: Unreviewed Documents',
               'You have ministry circulars pending review. Please check /dashboard/principal/inbox.',
               'principal',
               now()
        FROM public.ministry_circulars
        WHERE status = 'pending_review'
          AND created_at < now() - interval '7 days'
        GROUP BY school_id;
      $cron$
    );
  END IF;
END
$outer$;

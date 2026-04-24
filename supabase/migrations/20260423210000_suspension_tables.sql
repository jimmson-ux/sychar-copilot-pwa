-- Phase 4 — Suspension workflow: suspension_records, suspension_evidence, trigger

-- ── suspension_records ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suspension_records (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id               uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id              uuid NOT NULL REFERENCES public.students(id),
  case_id                 uuid,                        -- optional link to suspension_cases
  incident_ids            uuid[] DEFAULT '{}',
  case_summary            text,
  right_to_be_heard       boolean DEFAULT false,
  student_response        text,
  suspension_days         integer,
  start_date              date,
  end_date                date,
  readmission_conditions  text,
  proposed_by             uuid,
  approved_by             uuid,
  approved_at             timestamptz,
  document_hash           text,
  letter_pdf_url          text,
  signed_pdf_url          text,
  whatsapp_sent           boolean DEFAULT false,
  whatsapp_delivered      boolean DEFAULT false,
  whatsapp_delivered_at   timestamptz,
  sms_sent                boolean DEFAULT false,
  parent_meeting_date     date,
  status                  text DEFAULT 'draft'
    CHECK (status IN ('draft','pending_principal','approved','delivered','completed')),
  created_at              timestamptz DEFAULT now()
);

-- Add any columns a pre-existing table may be missing
ALTER TABLE public.suspension_records
  ADD COLUMN IF NOT EXISTS case_id               uuid,
  ADD COLUMN IF NOT EXISTS incident_ids          uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS case_summary          text,
  ADD COLUMN IF NOT EXISTS right_to_be_heard     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS student_response      text,
  ADD COLUMN IF NOT EXISTS suspension_days       integer,
  ADD COLUMN IF NOT EXISTS start_date            date,
  ADD COLUMN IF NOT EXISTS end_date              date,
  ADD COLUMN IF NOT EXISTS readmission_conditions text,
  ADD COLUMN IF NOT EXISTS proposed_by           uuid,
  ADD COLUMN IF NOT EXISTS document_hash         text,
  ADD COLUMN IF NOT EXISTS letter_pdf_url        text,
  ADD COLUMN IF NOT EXISTS signed_pdf_url        text,
  ADD COLUMN IF NOT EXISTS whatsapp_sent         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_delivered    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_sent              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_meeting_date   date;

ALTER TABLE public.suspension_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suspension_school" ON public.suspension_records;
CREATE POLICY "suspension_school" ON public.suspension_records
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_suspension_records_school
  ON public.suspension_records(school_id, student_id, status);

-- ── suspension_evidence ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suspension_evidence (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  suspension_id  uuid REFERENCES public.suspension_records(id) ON DELETE CASCADE,
  evidence_type  text CHECK (evidence_type IN
    ('discipline_record','tod_report','teacher_flag','photo','witness_statement')),
  reference_id   uuid,
  description    text,
  file_url       text,
  collected_at   timestamptz DEFAULT now()
);

ALTER TABLE public.suspension_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence_school" ON public.suspension_evidence;
CREATE POLICY "evidence_school" ON public.suspension_evidence
  FOR ALL TO authenticated
  USING (
    suspension_id IN (
      SELECT id FROM public.suspension_records
      WHERE school_id = public.get_my_school_id()
    )
  );

-- ── trigger: execute_suspension ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.execute_suspension()
RETURNS TRIGGER AS $outer$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    UPDATE public.students SET status = 'suspended'
    WHERE id = NEW.student_id;
  END IF;
  IF NEW.status = 'completed' AND OLD.status = 'approved' THEN
    UPDATE public.students SET status = 'active'
    WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$outer$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_execute_suspension ON public.suspension_records;
CREATE TRIGGER trg_execute_suspension
  AFTER UPDATE ON public.suspension_records
  FOR EACH ROW EXECUTE FUNCTION public.execute_suspension();

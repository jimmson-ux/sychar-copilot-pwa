-- ============================================================
-- FULL SCANNER SCHEMA — run once in Supabase SQL editor
-- ============================================================

-- Students
CREATE TABLE IF NOT EXISTS public.students (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID        NOT NULL,
  name            TEXT        NOT NULL,
  admission_number TEXT       UNIQUE,
  class_name      TEXT,
  stream_id       UUID,
  gender          TEXT,
  photo_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marks (extends existing schema with student & exam columns)
CREATE TABLE IF NOT EXISTS public.marks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID,
  class_id        UUID,
  subject_id      UUID,
  student_id      UUID        REFERENCES public.students(id) ON DELETE SET NULL,
  student_name    TEXT,
  admission_number TEXT,
  score           NUMERIC,
  percentage      NUMERIC,
  grade           TEXT,
  exam_type       TEXT,
  term            TEXT,
  academic_year   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, subject_id, student_id, exam_type, term)
);

-- Fee records
CREATE TABLE IF NOT EXISTS public.fee_records (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID        NOT NULL,
  student_id            UUID        REFERENCES public.students(id) ON DELETE SET NULL,
  student_name          TEXT,
  admission_number      TEXT,
  amount_paid           NUMERIC,
  payment_date          DATE,
  receipt_number        TEXT,
  term                  TEXT,
  payment_method        TEXT,
  reference_number      TEXT,
  mpesa_transaction_id  TEXT,
  paid_by_name          TEXT,
  paid_by_phone         TEXT,
  document_inbox_id     UUID        REFERENCES public.document_inbox(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fee structure items
CREATE TABLE IF NOT EXISTS public.fee_structure_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID        NOT NULL,
  item_name     TEXT        NOT NULL,
  amount        NUMERIC,
  due_date      TEXT,
  mandatory     BOOLEAN     DEFAULT TRUE,
  notes         TEXT,
  term          TEXT,
  academic_year TEXT,
  form_grade    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Discipline records
CREATE TABLE IF NOT EXISTS public.discipline_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID,
  student_id      UUID        REFERENCES public.students(id) ON DELETE SET NULL,
  student_name    TEXT,
  admission_number TEXT,
  class_name      TEXT,
  teacher_id      TEXT,
  letter_date     DATE,
  offence         TEXT,
  parent_signed   BOOLEAN     DEFAULT FALSE,
  teacher_signed  BOOLEAN     DEFAULT FALSE,
  tone            TEXT,
  notes           TEXT,
  image_url       TEXT,
  document_inbox_id UUID      REFERENCES public.document_inbox(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Department reports
CREATE TABLE IF NOT EXISTS public.department_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID,
  hod_id        TEXT,
  department    TEXT,
  report_date   DATE,
  issues        JSONB,
  action_items  JSONB,
  raw_text      TEXT,
  image_url     TEXT,
  document_inbox_id UUID    REFERENCES public.document_inbox(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OCR log
CREATE TABLE IF NOT EXISTS public.ocr_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task        TEXT,
  school_id   UUID,
  user_id     TEXT,
  confidence  NUMERIC,
  success     BOOLEAN,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff records
CREATE TABLE IF NOT EXISTS public.staff_records (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID        NOT NULL,
  user_id     UUID        UNIQUE NOT NULL,
  full_name   TEXT,
  sub_role    TEXT,
  department  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disable RLS (service role bypasses anyway)
ALTER TABLE public.students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structure_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discipline_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_records         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all_students"            ON public.students             FOR ALL USING (true);
CREATE POLICY "service_all_marks"               ON public.marks                FOR ALL USING (true);
CREATE POLICY "service_all_fee_records"         ON public.fee_records          FOR ALL USING (true);
CREATE POLICY "service_all_fee_structure"       ON public.fee_structure_items  FOR ALL USING (true);
CREATE POLICY "service_all_discipline"          ON public.discipline_records   FOR ALL USING (true);
CREATE POLICY "service_all_dept_reports"        ON public.department_reports   FOR ALL USING (true);
CREATE POLICY "service_all_ocr_log"             ON public.ocr_log              FOR ALL USING (true);
CREATE POLICY "service_all_staff"               ON public.staff_records        FOR ALL USING (true);

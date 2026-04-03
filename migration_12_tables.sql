-- ============================================================
-- SYCHAR COPILOT — 12 NEW TABLES MIGRATION (SECURITY-HARDENED)
-- RLS policies use get_my_school_id() — NOT hardcoded UUIDs.
-- HIGH-2: NOT NULL added to marks.school_id and discipline_records.school_id
-- LOW-16: ocr_log.user_id converted to UUID FK
-- ============================================================

-- ── 0. ENSURE HELPER FUNCTION EXISTS (idempotent) ────────────
-- get_my_school_id() resolves the calling user's school without
-- triggering RLS recursion. SECURITY DEFINER bypasses RLS on
-- the internal staff_records lookup.
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
$$;

-- ── 1. TEACHER TOKENS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_tokens (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id   uuid NOT NULL REFERENCES staff_records(id) ON DELETE CASCADE,
  school_id    uuid NOT NULL,
  token        text NOT NULL UNIQUE,
  token_type   text DEFAULT 'whatsapp_link'
               CHECK (token_type IN ('whatsapp_link', 'qr_code')),
  class_name   text,
  subject_name text,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_count   integer DEFAULT 0,
  max_uses     integer DEFAULT 200,
  is_active    boolean DEFAULT true,
  created_by   uuid,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_tokens_token   ON teacher_tokens(token);
CREATE INDEX IF NOT EXISTS idx_teacher_tokens_teacher ON teacher_tokens(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_tokens_school  ON teacher_tokens(school_id);
ALTER TABLE teacher_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teacher_tokens_school" ON teacher_tokens;
CREATE POLICY "teacher_tokens_select_own_school"
  ON teacher_tokens FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 2. CLASSROOM QR CODES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS classroom_qr_codes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    uuid NOT NULL,
  class_id     uuid REFERENCES classes(id),
  class_name   text NOT NULL,
  stream_name  text,
  subject_name text,
  teacher_id   uuid REFERENCES staff_records(id),
  qr_token     text NOT NULL UNIQUE,
  qr_url       text,
  is_active    boolean DEFAULT true,
  print_count  integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qr_school ON classroom_qr_codes(school_id);
CREATE INDEX IF NOT EXISTS idx_qr_token  ON classroom_qr_codes(qr_token);
ALTER TABLE classroom_qr_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qr_codes_school" ON classroom_qr_codes;
CREATE POLICY "qr_codes_select_own_school"
  ON classroom_qr_codes FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 3. RECORDS OF WORK ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS records_of_work (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id            uuid NOT NULL,
  teacher_id           uuid NOT NULL,
  teacher_token_id     uuid REFERENCES teacher_tokens(id),
  class_id             uuid,
  class_name           text NOT NULL,
  stream_name          text,
  subject_name         text NOT NULL,
  lesson_date          date NOT NULL DEFAULT CURRENT_DATE,
  period_number        integer CHECK (period_number BETWEEN 1 AND 8),
  week_number          integer CHECK (week_number BETWEEN 1 AND 13),
  term                 integer CHECK (term IN (1, 2, 3)),
  academic_year        text,
  topic                text NOT NULL,
  sub_topic            text NOT NULL,
  lesson_objectives    text,
  was_taught           boolean DEFAULT true,
  classwork_given      boolean DEFAULT false,
  homework_assigned    boolean DEFAULT false,
  remarks              text,
  submitted_via        text DEFAULT 'qr'
                       CHECK (submitted_via IN ('qr', 'whatsapp_link', 'pwa', 'offline_sync')),
  geolocation_lat      numeric,
  geolocation_lng      numeric,
  geolocation_verified boolean DEFAULT false,
  synced_at            timestamptz,
  created_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_row_teacher ON records_of_work(teacher_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_row_school  ON records_of_work(school_id, class_name, subject_name);
CREATE INDEX IF NOT EXISTS idx_row_term    ON records_of_work(school_id, term, academic_year);
ALTER TABLE records_of_work ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "row_school" ON records_of_work;
CREATE POLICY "row_select_own_school"
  ON records_of_work FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 4. SCHEMES OF WORK ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS schemes_of_work_new (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  teacher_id       uuid NOT NULL,
  subject_name     text NOT NULL,
  class_name       text NOT NULL,
  form_level       text,
  term             integer CHECK (term IN (1, 2, 3)),
  academic_year    text NOT NULL,
  weeks_per_term   integer DEFAULT 13,
  lessons_per_week integer DEFAULT 5,
  reference_books  jsonb DEFAULT '[]',
  weekly_plan      jsonb NOT NULL DEFAULT '[]',
  status           text DEFAULT 'draft'
                   CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  hod_comment      text,
  approved_by      uuid,
  approved_at      timestamptz,
  file_url         text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sow_teacher ON schemes_of_work_new(teacher_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_sow_school  ON schemes_of_work_new(school_id, class_name);
ALTER TABLE schemes_of_work_new ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sow_school" ON schemes_of_work_new;
CREATE POLICY "sow_select_own_school"
  ON schemes_of_work_new FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 5. SUBJECT PERFORMANCE ANALYSIS ─────────────────────────
CREATE TABLE IF NOT EXISTS subject_performance (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           uuid NOT NULL,
  teacher_id          uuid NOT NULL,
  student_id          uuid NOT NULL REFERENCES students(id),
  subject_name        text NOT NULL,
  class_name          text NOT NULL,
  exam_type           text NOT NULL
                      CHECK (exam_type IN ('opener','mid_term','end_term','mock','kcse','cat')),
  term                integer CHECK (term IN (1, 2, 3)),
  academic_year       text,
  topic               text,
  score               numeric CHECK (score BETWEEN 0 AND 100),
  out_of              numeric DEFAULT 100,
  grade               text,
  questions_failed    jsonb DEFAULT '[]',
  teacher_notes       text,
  intervention_needed boolean DEFAULT false,
  ai_lesson_plan      text,
  uploaded_via        text DEFAULT 'manual'
                      CHECK (uploaded_via IN ('manual', 'ocr_scan', 'bulk_upload')),
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perf_student ON subject_performance(student_id, subject_name);
CREATE INDEX IF NOT EXISTS idx_perf_class   ON subject_performance(class_name, exam_type, term);
CREATE INDEX IF NOT EXISTS idx_perf_school  ON subject_performance(school_id, subject_name);
ALTER TABLE subject_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perf_school" ON subject_performance;
CREATE POLICY "perf_select_own_school"
  ON subject_performance FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 6. MARKED EXAM UPLOADS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_uploads (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  teacher_id       uuid NOT NULL,
  teacher_token_id uuid REFERENCES teacher_tokens(id),
  subject_name     text NOT NULL,
  class_name       text NOT NULL,
  exam_type        text NOT NULL,
  term             integer,
  academic_year    text,
  image_url        text,
  gemini_extracted jsonb,
  scores_saved     boolean DEFAULT false,
  ai_analysis      text,
  failed_topics    jsonb DEFAULT '[]',
  total_students   integer,
  class_average    numeric,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_uploads_school ON exam_uploads(school_id, class_name);
ALTER TABLE exam_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_uploads_school" ON exam_uploads;
CREATE POLICY "exam_uploads_select_own_school"
  ON exam_uploads FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 7. LESSON PLANS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_plans (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           uuid NOT NULL,
  teacher_id          uuid NOT NULL,
  subject_name        text NOT NULL,
  class_name          text NOT NULL,
  target_topics       jsonb NOT NULL DEFAULT '[]',
  rationale           text,
  ai_generated_plan   text,
  teacher_edited_plan text,
  lessons_count       integer DEFAULT 3,
  status              text DEFAULT 'draft'
                      CHECK (status IN ('draft','submitted','approved','in_progress','completed')),
  hod_comment         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lp_teacher ON lesson_plans(teacher_id, class_name);
ALTER TABLE lesson_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lp_school" ON lesson_plans;
CREATE POLICY "lp_select_own_school"
  ON lesson_plans FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 8. INVIGILATION CHART ────────────────────────────────────
CREATE TABLE IF NOT EXISTS invigilation_chart (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  exam_name        text NOT NULL,
  exam_date        date NOT NULL,
  session          text NOT NULL CHECK (session IN ('morning', 'afternoon')),
  session_start    time NOT NULL,
  session_end      time,
  subject_name     text,
  paper_number     text,
  venue            text,
  room_number      text,
  candidate_count  integer,
  invigilator_id   uuid REFERENCES staff_records(id),
  invigilator_name text,
  tsc_number       text,
  supervisor_id    uuid REFERENCES staff_records(id),
  supervisor_name  text,
  is_confirmed     boolean DEFAULT false,
  notified_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invigilation_school ON invigilation_chart(school_id, exam_date);
ALTER TABLE invigilation_chart ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invigilation_school" ON invigilation_chart;
CREATE POLICY "invigilation_select_own_school"
  ON invigilation_chart FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 9. TIMETABLE ENHANCEMENTS ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'timetable'
  ) THEN
    ALTER TABLE timetable
      ADD COLUMN IF NOT EXISTS stream_name      text,
      ADD COLUMN IF NOT EXISTS teacher_name     text,
      ADD COLUMN IF NOT EXISTS teacher_initials text,
      ADD COLUMN IF NOT EXISTS subject_code     text,
      ADD COLUMN IF NOT EXISTS start_time       time,
      ADD COLUMN IF NOT EXISTS end_time         time,
      ADD COLUMN IF NOT EXISTS room             text,
      ADD COLUMN IF NOT EXISTS term             integer,
      ADD COLUMN IF NOT EXISTS academic_year    text,
      ADD COLUMN IF NOT EXISTS period_number    integer,
      ADD COLUMN IF NOT EXISTS is_active        boolean DEFAULT true;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS period_times (
  period_number integer PRIMARY KEY,
  period_label  text NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  period_type   text DEFAULT 'lesson'
                CHECK (period_type IN ('lesson','break','lunch','assembly','games'))
);

INSERT INTO period_times (period_number, period_label, start_time, end_time, period_type)
VALUES
  (0,  'Assembly',          '08:00', '08:20', 'assembly'),
  (1,  'Period 1',          '08:20', '09:00', 'lesson'),
  (2,  'Period 2',          '09:00', '09:40', 'lesson'),
  (99, 'Health Break',      '09:40', '09:50', 'break'),
  (3,  'Period 3',          '09:50', '10:30', 'lesson'),
  (4,  'Period 4',          '10:30', '11:10', 'lesson'),
  (98, 'Mid-Morning Break', '11:10', '11:40', 'break'),
  (5,  'Period 5',          '11:40', '12:20', 'lesson'),
  (6,  'Period 6',          '12:20', '13:00', 'lesson'),
  (97, 'Lunch Break',       '13:00', '14:00', 'lunch'),
  (7,  'Period 7',          '14:00', '14:40', 'lesson'),
  (8,  'Period 8',          '14:40', '15:20', 'lesson'),
  (96, 'Games/Clubs',       '15:20', '17:00', 'games')
ON CONFLICT (period_number) DO NOTHING;

-- period_times is reference data (no school_id) — authenticated users may read
ALTER TABLE period_times ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "period_times_read" ON period_times;
CREATE POLICY "period_times_read"
  ON period_times FOR SELECT TO authenticated USING (true);

-- ── 10. MERIT LIST ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merit_list (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id             uuid NOT NULL,
  student_id            uuid NOT NULL REFERENCES students(id),
  class_name            text NOT NULL,
  stream_name           text,
  exam_type             text NOT NULL,
  term                  integer,
  academic_year         text,
  total_marks           numeric,
  average_percent       numeric,
  class_rank            integer,
  stream_rank           integer,
  overall_grade         text,
  subject_grades        jsonb DEFAULT '{}',
  is_at_risk            boolean DEFAULT false,
  improvement_from_last numeric,
  created_at            timestamptz DEFAULT now(),
  UNIQUE(student_id, exam_type, term, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_merit_school ON merit_list(school_id, exam_type, term);
CREATE INDEX IF NOT EXISTS idx_merit_class  ON merit_list(class_name, class_rank);
ALTER TABLE merit_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "merit_school" ON merit_list;
CREATE POLICY "merit_select_own_school"
  ON merit_list FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 11. ACADEMIC CLINICS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_clinics (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  clinic_date      date NOT NULL,
  clinic_type      text DEFAULT 'academic_day'
                   CHECK (clinic_type IN ('academic_day','intervention','parent_meeting')),
  exam_reference   text,
  students_invited jsonb DEFAULT '[]',
  parents_notified integer DEFAULT 0,
  parents_attended integer DEFAULT 0,
  teachers_involved jsonb DEFAULT '[]',
  notes            text,
  status           text DEFAULT 'planned'
                   CHECK (status IN ('planned','notified','completed','cancelled')),
  created_by       uuid,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinic_school ON academic_clinics(school_id, clinic_date);
ALTER TABLE academic_clinics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_school" ON academic_clinics;
CREATE POLICY "clinic_select_own_school"
  ON academic_clinics FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 12. DOCUMENT COMPLIANCE ──────────────────────────────────
CREATE TABLE IF NOT EXISTS document_compliance (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id                uuid NOT NULL,
  teacher_id               uuid NOT NULL REFERENCES staff_records(id),
  term                     integer NOT NULL CHECK (term IN (1,2,3)),
  academic_year            text NOT NULL,
  scheme_submitted         boolean DEFAULT false,
  scheme_submitted_at      timestamptz,
  scheme_approved          boolean DEFAULT false,
  lesson_plan_submitted    boolean DEFAULT false,
  lesson_plan_submitted_at timestamptz,
  record_of_work_current   boolean DEFAULT false,
  last_row_date            date,
  row_weeks_covered        integer DEFAULT 0,
  compliance_score         integer GENERATED ALWAYS AS (
    (CASE WHEN scheme_submitted        THEN 33 ELSE 0 END +
     CASE WHEN lesson_plan_submitted   THEN 33 ELSE 0 END +
     CASE WHEN record_of_work_current  THEN 34 ELSE 0 END)
  ) STORED,
  last_reminded_at         timestamptz,
  updated_at               timestamptz DEFAULT now(),
  UNIQUE(teacher_id, term, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_compliance_school ON document_compliance(school_id, term, academic_year);
ALTER TABLE document_compliance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compliance_school" ON document_compliance;
CREATE POLICY "compliance_select_own_school"
  ON document_compliance FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── ENHANCE DISCIPLINE_RECORDS ───────────────────────────────
ALTER TABLE discipline_records
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'minor'
    CHECK (severity IN ('minor','moderate','serious','critical')),
  ADD COLUMN IF NOT EXISTS offence_type text,
  ADD COLUMN IF NOT EXISTS logged_by_teacher_id uuid,
  ADD COLUMN IF NOT EXISTS logged_via text DEFAULT 'pwa'
    CHECK (logged_via IN ('pwa','whatsapp','qr_form')),
  ADD COLUMN IF NOT EXISTS parent_notified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS dean_reviewed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS pattern_flagged boolean DEFAULT false;

-- ── HIGH-2: NOT NULL on school_id columns (guarded) ─────────
DO $$
BEGIN
  -- marks.school_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marks' AND column_name = 'school_id'
  ) THEN
    DELETE FROM public.marks WHERE school_id IS NULL;
    ALTER TABLE public.marks ALTER COLUMN school_id SET NOT NULL;
  END IF;

  -- discipline_records.school_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'discipline_records' AND column_name = 'school_id'
  ) THEN
    DELETE FROM public.discipline_records WHERE school_id IS NULL;
    ALTER TABLE public.discipline_records ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ── LOW-16: ocr_log.user_id → UUID FK ────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ocr_log'
      AND column_name  = 'user_id'
      AND data_type    = 'text'
  ) THEN
    -- Null out any values that aren't valid UUIDs
    UPDATE public.ocr_log
    SET user_id = NULL
    WHERE user_id IS NOT NULL
      AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE public.ocr_log
      ALTER COLUMN user_id TYPE UUID USING user_id::UUID;

    ALTER TABLE public.ocr_log
      ADD CONSTRAINT ocr_log_user_id_fk
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── TRIGGERS ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_row_compliance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO document_compliance (
    school_id, teacher_id, term, academic_year,
    record_of_work_current, last_row_date, row_weeks_covered, updated_at
  )
  VALUES (
    NEW.school_id, NEW.teacher_id, NEW.term, NEW.academic_year,
    true, NEW.lesson_date, NEW.week_number, now()
  )
  ON CONFLICT (teacher_id, term, academic_year)
  DO UPDATE SET
    record_of_work_current = true,
    last_row_date          = NEW.lesson_date,
    row_weeks_covered      = GREATEST(document_compliance.row_weeks_covered, NEW.week_number),
    updated_at             = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_row_compliance ON records_of_work;
CREATE TRIGGER trg_row_compliance
  AFTER INSERT ON records_of_work
  FOR EACH ROW EXECUTE FUNCTION update_row_compliance();

CREATE OR REPLACE FUNCTION check_discipline_pattern()
RETURNS TRIGGER AS $$
DECLARE
  incident_count integer;
BEGIN
  SELECT COUNT(*) INTO incident_count
  FROM discipline_records
  WHERE student_id = NEW.student_id
    AND created_at > now() - interval '7 days'
    AND school_id  = NEW.school_id;

  IF incident_count >= 3 THEN
    UPDATE discipline_records
    SET pattern_flagged = true
    WHERE student_id = NEW.student_id
      AND school_id  = NEW.school_id
      AND created_at > now() - interval '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discipline_pattern ON discipline_records;
CREATE TRIGGER trg_discipline_pattern
  AFTER INSERT ON discipline_records
  FOR EACH ROW EXECUTE FUNCTION check_discipline_pattern();

-- ── VERIFY ───────────────────────────────────────────────────
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'teacher_tokens','classroom_qr_codes','records_of_work',
    'schemes_of_work_new','subject_performance','exam_uploads',
    'lesson_plans','invigilation_chart','merit_list',
    'academic_clinics','document_compliance','period_times'
  )
ORDER BY tablename;

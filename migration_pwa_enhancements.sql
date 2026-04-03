-- PWA Enhancements Migration for Sychar Copilot
-- Run this in Supabase SQL Editor

-- ================================================
-- 1. DEVICE FINGERPRINTING FOR TEACHER TOKENS
-- ================================================
ALTER TABLE teacher_tokens
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS first_device_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_lock_enabled boolean DEFAULT true;

-- ================================================
-- 2. STUDENT REMARKS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS student_remarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid,
  class_name text NOT NULL,
  subject text NOT NULL,
  term integer,
  academic_year text,
  competency_communication integer CHECK (competency_communication BETWEEN 1 AND 5),
  competency_critical_thinking integer CHECK (competency_critical_thinking BETWEEN 1 AND 5),
  competency_creativity integer CHECK (competency_creativity BETWEEN 1 AND 5),
  competency_collaboration integer CHECK (competency_collaboration BETWEEN 1 AND 5),
  competency_character integer CHECK (competency_character BETWEEN 1 AND 5),
  subject_remarks text,
  quick_tag text CHECK (quick_tag IN ('positive','needs_improvement','excellent')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, teacher_id, subject, term, academic_year)
);

ALTER TABLE student_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on student_remarks" ON student_remarks;
CREATE POLICY "Allow all on student_remarks" ON student_remarks
  FOR ALL USING (true);

-- ================================================
-- 3. TEACHER NOTICES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS teacher_notices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  from_role text NOT NULL,
  from_user_id uuid,
  to_teacher_id uuid,
  to_department text,
  subject text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teacher_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on teacher_notices" ON teacher_notices;
CREATE POLICY "Allow all on teacher_notices" ON teacher_notices
  FOR ALL USING (true);

-- ================================================
-- 4. TIMETABLE PREFERENCES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS timetable_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  free_period_preferences jsonb DEFAULT '[]',
  avoid_back_to_back boolean DEFAULT false,
  max_lessons_per_day integer DEFAULT 5,
  preferred_morning boolean DEFAULT false,
  avoid_classes jsonb DEFAULT '[]',
  additional_notes text,
  term integer,
  academic_year text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(teacher_id, term, academic_year)
);

ALTER TABLE timetable_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on timetable_preferences" ON timetable_preferences;
CREATE POLICY "Allow all on timetable_preferences" ON timetable_preferences
  FOR ALL USING (true);

-- ================================================
-- 5. TIMETABLE VERSIONS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS timetable_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  version_name text NOT NULL,
  version_number integer DEFAULT 1,
  timetable_data jsonb NOT NULL DEFAULT '{}',
  conflicts jsonb DEFAULT '[]',
  generated_by text DEFAULT 'ai',
  status text DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  published_at timestamptz,
  term integer,
  academic_year text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE timetable_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on timetable_versions" ON timetable_versions;
CREATE POLICY "Allow all on timetable_versions" ON timetable_versions
  FOR ALL USING (true);

-- ================================================
-- 6. AUDIT LOG TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  user_id text NOT NULL,
  user_name text,
  action text NOT NULL,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on audit_log" ON audit_log;
CREATE POLICY "Allow all on audit_log" ON audit_log
  FOR ALL USING (true);

-- ================================================
-- 7. UPDATE SUB_ROLE CONSTRAINT TO INCLUDE QAO
-- ================================================
ALTER TABLE staff_records DROP CONSTRAINT IF EXISTS staff_records_sub_role_check;
ALTER TABLE staff_records ADD CONSTRAINT staff_records_sub_role_check
  CHECK (sub_role IN (
    'principal', 'deputy_principal_academics', 'deputy_principal_discipline',
    'dean_of_studies', 'dean_of_students', 'hod_subjects', 'hod_pathways',
    'class_teacher', 'bom_teacher', 'bursar', 'accountant',
    'guidance_counselling', 'storekeeper', 'secretary', 'librarian',
    'quality_assurance_officer', 'timetabling_committee'
  ));

-- ================================================
-- 8. QAO DEPARTMENT CODE
-- ================================================
INSERT INTO department_codes
  (school_id, department, code, subjects, color_primary, color_secondary)
VALUES
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Quality Assurance', '05Q',
   ARRAY['Quality Assurance','Curriculum'], '#384358', '#FFA586')
ON CONFLICT (school_id, code) DO NOTHING;

-- ================================================
-- 9. IS_PUBLISHED COLUMN FOR TIMETABLE
-- ================================================
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false;

-- ================================================
-- 10. SCHOOL_SETTINGS TIMETABLING COMMITTEE COLUMN
-- ================================================
ALTER TABLE school_settings
  ADD COLUMN IF NOT EXISTS timetabling_committee jsonb DEFAULT '[]';

-- ================================================
-- 11. HELPER FUNCTION: GET CURRENT TERM
-- ================================================
CREATE OR REPLACE FUNCTION get_current_term()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM NOW()) BETWEEN 1 AND 4 THEN 1
    WHEN EXTRACT(MONTH FROM NOW()) BETWEEN 5 AND 8 THEN 2
    ELSE 3
  END;
$$;

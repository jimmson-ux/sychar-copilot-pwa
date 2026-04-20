-- ============================================================
-- PRE-PHASE-0 FIXES  — 2026-04-09
-- Approved by: school admin
-- Rules: ADDITIVE ONLY — no drops, no truncates, no deletes
-- ============================================================

-- ── ISSUE 1: Add id column to period_times ────────────────────
-- Table currently has 13 rows of Nkoroi timetable data.
-- Columns: period_number, period_label, start_time, end_time, period_type
-- Adding id so PostgREST and client queries can reference rows.
-- gen_random_uuid() auto-fills for all 13 existing rows.
-- NOT adding school_id — period_times is shared reference data
-- (all schools share the same school-day structure; school-specific
-- overrides will come in the timetabling phase via a separate table).

ALTER TABLE period_times
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- ── ISSUE 2a: Create department_reports skeleton ──────────────
-- Referenced in scanner code but absent from live DB.
-- Skeleton only — full columns (hod_id, report_date, issues, etc.)
-- will be added in the HOD Reports phase.
-- CORRECTION from user-supplied SQL: using get_my_school_id()
-- because public.users does not exist; staff_records is the
-- user→school resolver in this project.

CREATE TABLE IF NOT EXISTS department_reports (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE department_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dept_reports_school_isolation"
  ON department_reports FOR ALL TO authenticated
  USING  (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── ISSUE 2b: Create ocr_log skeleton ────────────────────────
-- Referenced in scanner code but absent from live DB.
-- Skeleton only — full columns (task, confidence, success, etc.)
-- will be added in the Document Scanner phase.

CREATE TABLE IF NOT EXISTS ocr_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ocr_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ocr_log_school_isolation"
  ON ocr_log FOR ALL TO authenticated
  USING  (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── CURRICULUM MIX: Add to school_settings ───────────────────
-- Nkoroi's existing row gets DEFAULT 'fusion' automatically.
-- UI must display 'fusion' as "Transitioning (CBC + 8-4-4)" —
-- never expose the word "fusion" to end users.
--
-- Label mapping (enforced in UI only, not in DB):
--   'CBC'    → "CBC Only (Grade 10)"
--   '844'    → "8-4-4 Only (Form 1-4)"
--   'fusion' → "Transitioning (CBC + 8-4-4)"

ALTER TABLE school_settings
  ADD COLUMN IF NOT EXISTS curriculum_mix TEXT
    DEFAULT 'fusion'
    CHECK (curriculum_mix IN ('CBC', '844', 'fusion'));

-- ── VERIFICATION QUERIES (run after push to confirm) ─────────
-- SELECT COUNT(*) FROM period_times;        -- expect 13
-- SELECT COUNT(*) FROM department_reports;  -- expect 0
-- SELECT COUNT(*) FROM ocr_log;             -- expect 0
-- SELECT curriculum_mix FROM school_settings
--   WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'; -- expect 'fusion'
-- SELECT name, year_group, curriculum_type FROM classes
--   ORDER BY year_group, name;              -- Grade 10 = CBE, Form 3/4 = 844

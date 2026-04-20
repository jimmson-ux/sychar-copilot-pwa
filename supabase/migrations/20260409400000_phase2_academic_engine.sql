-- ============================================================
-- Phase 2: Academic Engine — tables, RLS, and seed data
-- Handles pre-existing subjects/requisitions tables gracefully.
-- ============================================================

-- ── subjects ────────────────────────────────────────────────
-- Table may already exist with a different schema; add missing cols only.
CREATE TABLE IF NOT EXISTS subjects (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  name             text NOT NULL,
  created_at       timestamptz DEFAULT now()
);

-- Add Phase 2 columns if missing
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS code             text,
  ADD COLUMN IF NOT EXISTS department       text,
  ADD COLUMN IF NOT EXISTS cognitive_demand integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS curriculum_type  text DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS is_core          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS lessons_per_week integer DEFAULT 5;

-- Validate/set cognitive_demand range (no constraint adding if already constrained)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'subjects'::regclass AND conname = 'subjects_cognitive_demand_check'
  ) THEN
    ALTER TABLE subjects
      ADD CONSTRAINT subjects_cognitive_demand_check
      CHECK (cognitive_demand BETWEEN 1 AND 3);
  END IF;
END$$;

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subjects' AND policyname='subjects_select_school') THEN
    CREATE POLICY "subjects_select_school" ON subjects FOR SELECT TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subjects' AND policyname='subjects_insert_school') THEN
    CREATE POLICY "subjects_insert_school" ON subjects FOR INSERT TO authenticated
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subjects' AND policyname='subjects_update_school') THEN
    CREATE POLICY "subjects_update_school" ON subjects FOR UPDATE TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── timetable_jobs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_jobs (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid NOT NULL,
  created_by     uuid NOT NULL,
  status         text DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed')),
  progress       integer DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  config         jsonb DEFAULT '{}',
  result_summary jsonb,
  error_message  text,
  created_at     timestamptz DEFAULT now(),
  started_at     timestamptz,
  completed_at   timestamptz
);

ALTER TABLE timetable_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='timetable_jobs' AND policyname='timetable_jobs_select_school') THEN
    CREATE POLICY "timetable_jobs_select_school" ON timetable_jobs FOR SELECT TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='timetable_jobs' AND policyname='timetable_jobs_insert_school') THEN
    CREATE POLICY "timetable_jobs_insert_school" ON timetable_jobs FOR INSERT TO authenticated
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='timetable_jobs' AND policyname='timetable_jobs_update_school') THEN
    CREATE POLICY "timetable_jobs_update_school" ON timetable_jobs FOR UPDATE TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── duty_rota ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS duty_rota (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  teacher_id       uuid NOT NULL REFERENCES staff_records(id),
  duty_date        date NOT NULL,
  duty_slot        text NOT NULL CHECK (duty_slot IN ('morning','afternoon','evening','full_day')),
  duty_type        text DEFAULT 'tod' CHECK (duty_type IN ('tod','gate','dining','games')),
  tod_score        decimal DEFAULT 0,
  is_priority_week boolean DEFAULT false,
  notes            text,
  assigned_by      uuid,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(teacher_id, duty_date, duty_slot)
);

ALTER TABLE duty_rota ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='duty_rota' AND policyname='duty_rota_select_school') THEN
    CREATE POLICY "duty_rota_select_school" ON duty_rota FOR SELECT TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='duty_rota' AND policyname='duty_rota_insert_school') THEN
    CREATE POLICY "duty_rota_insert_school" ON duty_rota FOR INSERT TO authenticated
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='duty_rota' AND policyname='duty_rota_update_school') THEN
    CREATE POLICY "duty_rota_update_school" ON duty_rota FOR UPDATE TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='duty_rota' AND policyname='duty_rota_delete_school') THEN
    CREATE POLICY "duty_rota_delete_school" ON duty_rota FOR DELETE TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── leave_requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  teacher_id       uuid NOT NULL REFERENCES staff_records(id),
  leave_type       text NOT NULL CHECK (leave_type IN ('sick','compassionate','maternity','study','annual','other')),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  days_requested   integer NOT NULL,
  reason           text,
  status           text DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  review_notes     text,
  timetable_impact jsonb,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_requests' AND policyname='leave_requests_select_school') THEN
    CREATE POLICY "leave_requests_select_school" ON leave_requests FOR SELECT TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_requests' AND policyname='leave_requests_insert_school') THEN
    CREATE POLICY "leave_requests_insert_school" ON leave_requests FOR INSERT TO authenticated
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_requests' AND policyname='leave_requests_update_school') THEN
    CREATE POLICY "leave_requests_update_school" ON leave_requests FOR UPDATE TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── domain_proposals ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domain_proposals (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid NOT NULL,
  requester_id   uuid NOT NULL,
  target_domain  text NOT NULL CHECK (target_domain IN ('academic','admin')),
  action_type    text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',
  status         text DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  remarks        text,
  created_at     timestamptz DEFAULT now(),
  resolved_at    timestamptz,
  resolved_by    uuid
);

ALTER TABLE domain_proposals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='domain_proposals' AND policyname='domain_proposals_select_school') THEN
    CREATE POLICY "domain_proposals_select_school" ON domain_proposals FOR SELECT TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='domain_proposals' AND policyname='domain_proposals_insert_school') THEN
    CREATE POLICY "domain_proposals_insert_school" ON domain_proposals FOR INSERT TO authenticated
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='domain_proposals' AND policyname='domain_proposals_update_school') THEN
    CREATE POLICY "domain_proposals_update_school" ON domain_proposals FOR UPDATE TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── requisitions ─────────────────────────────────────────────
-- Pre-existing table had no school_id; add all missing Phase 2 columns.
CREATE TABLE IF NOT EXISTS requisitions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS school_id      uuid,
  ADD COLUMN IF NOT EXISTS requester_id   uuid REFERENCES staff_records(id),
  ADD COLUMN IF NOT EXISTS department     text,
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS items          jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS estimated_cost decimal,
  ADD COLUMN IF NOT EXISTS currency       text DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS status         text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by    uuid,
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_at   timestamptz,
  ADD COLUMN IF NOT EXISTS received_at    timestamptz,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS academic_year  text,
  ADD COLUMN IF NOT EXISTS term           integer,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='requisitions' AND policyname='requisitions_select_school') THEN
    CREATE POLICY "requisitions_select_school" ON requisitions FOR SELECT TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='requisitions' AND policyname='requisitions_insert_school') THEN
    CREATE POLICY "requisitions_insert_school" ON requisitions FOR INSERT TO authenticated
      WITH CHECK (school_id = public.get_my_school_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='requisitions' AND policyname='requisitions_update_school') THEN
    CREATE POLICY "requisitions_update_school" ON requisitions FOR UPDATE TO authenticated
      USING (school_id = public.get_my_school_id());
  END IF;
END$$;

-- ── Alter existing tables ────────────────────────────────────
ALTER TABLE staff_records
  ADD COLUMN IF NOT EXISTS max_daily_lessons integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS reliability_index decimal DEFAULT 1.0;

ALTER TABLE period_times
  ADD COLUMN IF NOT EXISTS cognitive_yield integer DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'period_times'::regclass AND conname = 'period_times_cognitive_yield_check'
  ) THEN
    ALTER TABLE period_times
      ADD CONSTRAINT period_times_cognitive_yield_check
      CHECK (cognitive_yield BETWEEN 1 AND 3);
  END IF;
END$$;

UPDATE period_times SET cognitive_yield = 3 WHERE period_number IN (1,2,3,4);
UPDATE period_times SET cognitive_yield = 2 WHERE period_number IN (5,6);
UPDATE period_times SET cognitive_yield = 1 WHERE period_number IN (7,8);

ALTER TABLE timetable
  ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES staff_records(id);

-- ── Timetable RLS: deputy_academic writes ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='timetable' AND policyname='timetable_select_school') THEN
    CREATE POLICY "timetable_select_school"
      ON timetable FOR SELECT TO authenticated
      USING (school_id::text = public.get_my_school_id()::text);
  END IF;
END$$;

-- Cast school_id::text on timetable since that column may be TEXT type.
-- For staff_records the user_id IS uuid so auth.uid() comparison works directly.
DROP POLICY IF EXISTS "timetable_update_deputy_academic" ON timetable;
CREATE POLICY "timetable_update_deputy_academic"
  ON timetable FOR UPDATE TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id::text = auth.uid()::text
        AND sub_role IN ('deputy_principal_academics','deputy_principal_academic','principal')
    )
  );

DROP POLICY IF EXISTS "timetable_insert_deputy_academic" ON timetable;
CREATE POLICY "timetable_insert_deputy_academic"
  ON timetable FOR INSERT TO authenticated
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id::text = auth.uid()::text
        AND sub_role IN ('deputy_principal_academics','deputy_principal_academic','principal')
    )
  );

DROP POLICY IF EXISTS "timetable_delete_deputy_academic" ON timetable;
CREATE POLICY "timetable_delete_deputy_academic"
  ON timetable FOR DELETE TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id::text = auth.uid()::text
        AND sub_role IN ('deputy_principal_academics','deputy_principal_academic','principal')
    )
  );

-- ── Discipline records RLS: deputy_admin writes ───────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='discipline_records' AND policyname='discipline_records_select_school') THEN
    CREATE POLICY "discipline_records_select_school"
      ON discipline_records FOR SELECT TO authenticated
      USING (school_id = public.get_my_school_id());  -- discipline.school_id is UUID, no cast needed
  END IF;
END$$;

DROP POLICY IF EXISTS "discipline_records_update_deputy_admin" ON discipline_records;
CREATE POLICY "discipline_records_update_deputy_admin"
  ON discipline_records FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id::text = auth.uid()::text
        AND sub_role IN ('deputy_principal_admin','deputy_principal_discipline','principal')
    )
  );

DROP POLICY IF EXISTS "discipline_records_insert_deputy_admin" ON discipline_records;
CREATE POLICY "discipline_records_insert_deputy_admin"
  ON discipline_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id::text = auth.uid()::text
        AND sub_role IN (
          'deputy_principal_admin','deputy_principal_discipline','principal',
          'class_teacher','bom_teacher','subject_teacher','dean_of_students'
        )
    )
  );

DROP POLICY IF EXISTS "discipline_records_delete_deputy_admin" ON discipline_records;
CREATE POLICY "discipline_records_delete_deputy_admin"
  ON discipline_records FOR DELETE TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id::text = auth.uid()::text
        AND sub_role IN ('deputy_principal_admin','deputy_principal_discipline','principal')
    )
  );

-- ── Seed cognitive_demand for Nkoroi subjects ─────────────────
-- Update existing subjects rows (created with old schema — no cognitive_demand)
UPDATE subjects SET cognitive_demand = 3
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND LOWER(name) IN (
    'mathematics','physics','chemistry','biology','english','computer studies',
    'english (8-4-4)','mathematics (8-4-4)','additional mathematics'
  );

UPDATE subjects SET cognitive_demand = 2
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND cognitive_demand IS NULL;

-- Add unique constraint on (school_id, name) if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'subjects'::regclass AND conname = 'subjects_school_id_name_key'
  ) THEN
    ALTER TABLE subjects ADD CONSTRAINT subjects_school_id_name_key UNIQUE (school_id, name);
  END IF;
END$$;

-- Update cognitive_demand on existing rows (matched by name fragment)
UPDATE subjects
SET cognitive_demand = 3
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND (name ILIKE '%mathematics%' OR name ILIKE '%physics%' OR name ILIKE '%chemistry%'
       OR name ILIKE '%biology%' OR name ILIKE '%english%' OR name ILIKE '%computer%');

UPDATE subjects
SET cognitive_demand = 2
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND cognitive_demand IS NULL
  AND (name ILIKE '%geography%' OR name ILIKE '%history%' OR name ILIKE '%cre%'
       OR name ILIKE '%business%' OR name ILIKE '%economics%'
       OR name ILIKE '%kiswahili%' OR name ILIKE '%french%');

UPDATE subjects
SET cognitive_demand = 1
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND cognitive_demand IS NULL
  AND (name ILIKE '%physical education%' OR name ILIKE '%games%'
       OR name ILIKE '%agriculture%' OR name ILIKE '%home science%'
       OR name ILIKE '%technical%' OR name ILIKE '%art%');

-- Default anything still NULL to 2
UPDATE subjects SET cognitive_demand = 2
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND cognitive_demand IS NULL;

-- Only update cognitive_demand on existing rows; do not INSERT (existing subjects table
-- has many NOT NULL columns with custom enums that differ from Phase 2 schema).
-- The GA engine reads whatever subjects exist in the school's subjects table.
UPDATE subjects
SET cognitive_demand = 1
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND (name ILIKE '%physical education%' OR name ILIKE '%pe%' OR name ILIKE '%games%'
       OR name ILIKE '%agriculture%' OR name ILIKE '%home science%'
       OR name ILIKE '%technical drawing%' OR name ILIKE '%art%')
  AND cognitive_demand IS NULL;

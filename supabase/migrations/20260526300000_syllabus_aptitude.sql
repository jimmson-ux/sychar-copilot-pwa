-- ================================================================
-- SYLLABUS TRACKING + STUDENT APTITUDE — 2026-05-26
--
-- NEW TABLES:
--   syllabus_topics    — master national curriculum map (admin loads once)
--   syllabus_progress  — actual per-class coverage (teacher-reported)
--   student_aptitude   — ability grouping, auto-updated from exam_results
--
-- syllabus_progress.status vs expected_week drives the weekly
-- behind-schedule check (edge function weekly-syllabus-check).
--
-- student_aptitude is auto-updated by trigger after exam_results insert.
-- Groups: Extension (avg≥80), Core (50–79), Support (<50).
-- ================================================================


-- ── 1. SYLLABUS TOPICS (master curriculum map) ───────────────────

CREATE TABLE IF NOT EXISTS public.syllabus_topics (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject          text        NOT NULL,    -- matches timetable_periods.subject
  class_level      text,                    -- 'Form 1', 'Form 2', 'Grade 7'
  topic_name       text        NOT NULL,
  subtopic_name    text,
  strand           text,                    -- CBC strand where applicable
  expected_week    int,                     -- school week number (1–40)
  expected_term    int         CHECK (expected_term BETWEEN 1 AND 3),
  curriculum_type  text        DEFAULT '844'
    CHECK (curriculum_type IN ('844','CBC','CBE')),
  sort_order       int         DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_school_subject
  ON public.syllabus_topics (school_id, subject, class_level);
CREATE INDEX IF NOT EXISTS idx_st_school_week
  ON public.syllabus_topics (school_id, expected_week, expected_term);

ALTER TABLE public.syllabus_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_school_read"   ON public.syllabus_topics;
DROP POLICY IF EXISTS "st_hod_write"     ON public.syllabus_topics;
DROP POLICY IF EXISTS "st_service"       ON public.syllabus_topics;

CREATE POLICY "st_school_read" ON public.syllabus_topics
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "st_hod_write" ON public.syllabus_topics
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'hod','deputy_principal','deputy_principal_academic',
      'dean_of_studies','principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'hod','deputy_principal','deputy_principal_academic',
      'dean_of_studies','principal','super_admin'
    )
  );

CREATE POLICY "st_service" ON public.syllabus_topics
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. SYLLABUS PROGRESS (actual per-class coverage) ─────────────
-- NOTE: syllabus_progress may already exist from the teacher-dashboard sprint
-- (2026-05-24) with a partial schema. We use CREATE TABLE IF NOT EXISTS and
-- then ALTER TABLE ADD COLUMN IF NOT EXISTS to bring it to the target schema.

CREATE TABLE IF NOT EXISTS public.syllabus_progress (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid        REFERENCES public.schools(id) ON DELETE CASCADE,
  topic_id       uuid        REFERENCES public.syllabus_topics(id) ON DELETE CASCADE,
  class_id       text        NOT NULL,
  class_name     text,
  teacher_id     uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  status         text        DEFAULT 'Pending'
    CHECK (status IN ('Pending','InProgress','Completed','Skipped')),
  completed_at   date,
  notes          text,
  updated_at     timestamptz DEFAULT now()
);

-- Ensure all required columns exist on pre-existing table
ALTER TABLE public.syllabus_progress
  ADD COLUMN IF NOT EXISTS school_id    uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS topic_id     uuid REFERENCES public.syllabus_topics(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS class_name   text,
  ADD COLUMN IF NOT EXISTS teacher_id   uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status       text DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS completed_at date,
  ADD COLUMN IF NOT EXISTS notes        text,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();

-- Add unique constraint only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'syllabus_progress_topic_id_class_id_key'
      AND conrelid = 'public.syllabus_progress'::regclass
  ) THEN
    ALTER TABLE public.syllabus_progress ADD CONSTRAINT syllabus_progress_topic_id_class_id_key UNIQUE (topic_id, class_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL; -- ignore if constraint can't be added
END $$;

CREATE INDEX IF NOT EXISTS idx_sp_school_class
  ON public.syllabus_progress (school_id, class_id, status)
  WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sp_teacher
  ON public.syllabus_progress (teacher_id, status);

ALTER TABLE public.syllabus_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sprg_school_read"    ON public.syllabus_progress;
DROP POLICY IF EXISTS "sprg_teacher_write"  ON public.syllabus_progress;
DROP POLICY IF EXISTS "sprg_service"        ON public.syllabus_progress;

CREATE POLICY "sprg_school_read" ON public.syllabus_progress
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "sprg_teacher_write" ON public.syllabus_progress
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE POLICY "sprg_service" ON public.syllabus_progress
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. STUDENT APTITUDE ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_aptitude (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                 uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id                uuid        UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  normalized_aptitude_score numeric(5,2) DEFAULT 0,
  aptitude_group            text        DEFAULT 'Core'
    CHECK (aptitude_group IN ('Extension','Core','Support')),
  percentile_rank           numeric(5,2),
  subject_breakdown         jsonb       DEFAULT '{}',
  last_updated              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apt_school_group
  ON public.student_aptitude (school_id, aptitude_group);

ALTER TABLE public.student_aptitude ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apt_school_read"  ON public.student_aptitude;
DROP POLICY IF EXISTS "apt_service"      ON public.student_aptitude;

CREATE POLICY "apt_school_read" ON public.student_aptitude
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "apt_service" ON public.student_aptitude
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3a. APTITUDE AUTO-UPDATE TRIGGER ─────────────────────────────
-- Fires after INSERT/UPDATE on exam_results.
-- exam_results.student_id is TEXT (not UUID) — cast needed.

CREATE OR REPLACE FUNCTION public.trg_fn_update_student_aptitude()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg           numeric;
  v_group         text;
  v_school_id     uuid;
  v_student_uuid  uuid;
BEGIN
  -- Cast text student_id to uuid
  BEGIN
    v_student_uuid := NEW.student_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  -- Get school_id from the student record
  SELECT school_id INTO v_school_id
  FROM public.students
  WHERE id = v_student_uuid
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Average score across all exams for this student
  SELECT AVG(score) INTO v_avg
  FROM public.exam_results
  WHERE student_id = NEW.student_id
    AND school_id  = NEW.school_id;

  v_avg := COALESCE(v_avg, 0);

  IF v_avg >= 80 THEN v_group := 'Extension';
  ELSIF v_avg >= 50 THEN v_group := 'Core';
  ELSE v_group := 'Support';
  END IF;

  INSERT INTO public.student_aptitude (
    school_id, student_id, normalized_aptitude_score,
    aptitude_group, last_updated
  )
  VALUES (v_school_id, v_student_uuid, v_avg, v_group, now())
  ON CONFLICT (student_id) DO UPDATE SET
    normalized_aptitude_score = EXCLUDED.normalized_aptitude_score,
    aptitude_group            = EXCLUDED.aptitude_group,
    last_updated              = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_aptitude ON public.exam_results;
CREATE TRIGGER trg_update_aptitude
  AFTER INSERT OR UPDATE ON public.exam_results
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_update_student_aptitude();

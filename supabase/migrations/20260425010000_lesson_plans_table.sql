-- ============================================================
-- Lesson Plans — extend existing table with new columns
-- The table was created in 20260328000000_new_tables.sql
-- ============================================================

ALTER TABLE public.lesson_plans
  ADD COLUMN IF NOT EXISTS stream_name           text,
  ADD COLUMN IF NOT EXISTS term                  integer CHECK (term IN (1,2,3)),
  ADD COLUMN IF NOT EXISTS academic_year         text,
  ADD COLUMN IF NOT EXISTS week_number           integer CHECK (week_number BETWEEN 1 AND 14),
  ADD COLUMN IF NOT EXISTS lesson_number         integer,
  ADD COLUMN IF NOT EXISTS topic                 text,
  ADD COLUMN IF NOT EXISTS sub_topic             text,
  ADD COLUMN IF NOT EXISTS specific_outcomes     text,
  ADD COLUMN IF NOT EXISTS learning_experiences  text,
  ADD COLUMN IF NOT EXISTS learning_resources    text,
  ADD COLUMN IF NOT EXISTS assessment_methods    text,
  ADD COLUMN IF NOT EXISTS time_allocation_mins  integer DEFAULT 40,
  ADD COLUMN IF NOT EXISTS curriculum_type       text DEFAULT '844'
                           CHECK (curriculum_type IN ('CBC','844')),
  ADD COLUMN IF NOT EXISTS cbc_strand            text,
  ADD COLUMN IF NOT EXISTS cbc_sub_strand        text,
  ADD COLUMN IF NOT EXISTS ai_generated          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by           uuid,
  ADD COLUMN IF NOT EXISTS approved_at           timestamptz,
  ADD COLUMN IF NOT EXISTS file_url              text;

-- Backfill topic from subject_name for existing rows (topic is used in new queries)
UPDATE public.lesson_plans
  SET topic = COALESCE(subject_name, 'General')
  WHERE topic IS NULL;

-- Add school_id index if not present
CREATE INDEX IF NOT EXISTS idx_lp_school
  ON public.lesson_plans(school_id, class_name, subject_name);
CREATE INDEX IF NOT EXISTS idx_lp_status
  ON public.lesson_plans(school_id, status);
-- Note: idx_lp_teacher already exists on (teacher_id, class_name)

-- Update RLS — add service_role bypass (previously missing)
DROP POLICY IF EXISTS "lp_service" ON public.lesson_plans;
CREATE POLICY "lp_service" ON public.lesson_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add HOD / principal read access (the old policy was SELECT-only for authenticated)
DROP POLICY IF EXISTS "lp_teacher_own" ON public.lesson_plans;
CREATE POLICY "lp_teacher_own" ON public.lesson_plans
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND (
      teacher_id = (
        SELECT id FROM public.staff_records
        WHERE user_id = auth.uid()::text LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_records
        WHERE user_id = auth.uid()::text
          AND sub_role IN (
            'principal','deputy_principal','deputy_principal_academic',
            'dean_of_studies','hod_sciences','hod_arts',
            'hod_languages','hod_mathematics',
            'hod_social_sciences','hod_technical','hod_pathways'
          )
        LIMIT 1
      )
    )
  );

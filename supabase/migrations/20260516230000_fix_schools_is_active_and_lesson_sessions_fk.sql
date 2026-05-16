-- ================================================================
-- Fix two 400-series errors reported by Lovable:
--   1. schools.is_active does not exist
--   2. lesson_sessions ↔ staff_records FK missing
--      (teacher_id was text; must be uuid with a real FK for
--       PostgREST to discover the relationship)
-- ================================================================

-- ── 1. schools.is_active ─────────────────────────────────────────────────────

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_schools_is_active
  ON public.schools (is_active);

UPDATE public.schools SET is_active = true WHERE is_active IS NULL;


-- ── 2. lesson_sessions.teacher_id: text → uuid + FK to staff_records ─────────
-- The phase3 migration created teacher_id as TEXT. Changing the column type
-- requires dropping every RLS policy that references it first, then
-- recreating them with the correct UUID comparison.

DO $$
BEGIN

  -- ── 2a. Drop all policies that reference teacher_id ──────────────────────
  DROP POLICY IF EXISTS "lesson_sessions_select"  ON public.lesson_sessions;
  DROP POLICY IF EXISTS "lesson_sessions_insert"  ON public.lesson_sessions;
  DROP POLICY IF EXISTS "lesson_sessions_update"  ON public.lesson_sessions;
  DROP POLICY IF EXISTS "lesson_sessions_service" ON public.lesson_sessions;

  -- ── 2b. Change column type if still text ─────────────────────────────────
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'lesson_sessions'
      AND  column_name  = 'teacher_id'
      AND  data_type    = 'text'
  ) THEN
    -- Allow NULLs during the conversion
    ALTER TABLE public.lesson_sessions ALTER COLUMN teacher_id DROP NOT NULL;

    -- Zero out any rows whose teacher_id is not a valid UUID
    UPDATE public.lesson_sessions
    SET    teacher_id = NULL
    WHERE  teacher_id IS NOT NULL
      AND  teacher_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE public.lesson_sessions
      ALTER COLUMN teacher_id TYPE uuid USING teacher_id::uuid;

    RAISE NOTICE 'lesson_sessions.teacher_id converted text → uuid';
  ELSE
    RAISE NOTICE 'lesson_sessions.teacher_id already uuid, skipping type change';
  END IF;

  -- ── 2c. Add FK if missing ─────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname    = 'lesson_sessions_teacher_id_fkey'
      AND  conrelid   = 'public.lesson_sessions'::regclass
  ) THEN
    ALTER TABLE public.lesson_sessions
      ADD CONSTRAINT lesson_sessions_teacher_id_fkey
      FOREIGN KEY (teacher_id)
      REFERENCES public.staff_records(id)
      ON DELETE SET NULL;

    RAISE NOTICE 'FK lesson_sessions.teacher_id → staff_records added';
  END IF;

  -- ── 2d. Recreate policies (now using uuid comparison) ────────────────────
  CREATE POLICY "lesson_sessions_select" ON public.lesson_sessions
    FOR SELECT USING (school_id = public.get_my_school_id());

  CREATE POLICY "lesson_sessions_insert" ON public.lesson_sessions
    FOR INSERT WITH CHECK (
      school_id = public.get_my_school_id()
      AND EXISTS (
        SELECT 1 FROM public.staff_records sr
        WHERE sr.user_id = auth.uid()::text
          AND sr.school_id = public.lesson_sessions.school_id
      )
    );

  CREATE POLICY "lesson_sessions_update" ON public.lesson_sessions
    FOR UPDATE USING (
      teacher_id IN (
        SELECT sr.id FROM public.staff_records sr
        WHERE sr.user_id = auth.uid()::text
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_records sr
        WHERE sr.user_id = auth.uid()::text
          AND sr.sub_role IN (
            'principal','deputy_principal_academics',
            'deputy_principal_academic','deputy_principal'
          )
          AND sr.school_id = public.lesson_sessions.school_id
      )
    );

  CREATE POLICY "lesson_sessions_service" ON public.lesson_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

END $$;

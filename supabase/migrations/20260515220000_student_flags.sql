-- Early Warning student_flags table
-- Written to by the early-warning Supabase Edge Function (daily cron).
-- Read by the counselor dashboard to surface at-risk students.

CREATE TABLE IF NOT EXISTS public.student_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reason      text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'MEDIUM'
                          CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  is_reviewed boolean     NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.student_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_flags_school" ON public.student_flags
  FOR ALL TO authenticated
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "student_flags_service" ON public.student_flags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_student_flags_school_reviewed
  ON public.student_flags(school_id, is_reviewed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_flags_student
  ON public.student_flags(student_id, created_at DESC);

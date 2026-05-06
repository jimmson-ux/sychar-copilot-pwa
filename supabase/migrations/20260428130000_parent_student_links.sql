-- ============================================================
-- Parent-Student Links
-- Connects parents (identified by phone) to students.
-- Used by: exeat requests, parent verification flow, parent PWA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  parent_id       text NOT NULL,               -- parent phone number (from parent JWT)
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relationship    text DEFAULT 'guardian'
                  CHECK (relationship IN (
                    'mother','father','guardian','grandparent','sibling','other'
                  )),
  is_primary      boolean DEFAULT true,
  is_active       boolean DEFAULT true,
  verified        boolean DEFAULT false,
  verified_at     timestamptz,
  verified_by     uuid REFERENCES public.staff_records(id),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_psl_parent  ON public.parent_student_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_psl_student ON public.parent_student_links(student_id);
CREATE INDEX IF NOT EXISTS idx_psl_school  ON public.parent_student_links(school_id, is_active);

ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psl_school"  ON public.parent_student_links;
DROP POLICY IF EXISTS "psl_service" ON public.parent_student_links;

CREATE POLICY "psl_school" ON public.parent_student_links
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "psl_service" ON public.parent_student_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Teacher Subject Assignments — multi-subject + principal-as-teacher
-- ============================================================

CREATE TABLE IF NOT EXISTS public.teacher_subject_assignments (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id               uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id              uuid NOT NULL REFERENCES public.staff_records(id) ON DELETE CASCADE,
  subject_name            text NOT NULL,
  subject_code            text,
  department              text NOT NULL,
  curriculum_type         text DEFAULT 'both'
                          CHECK (curriculum_type IN ('CBC','844','both')),
  class_levels            text[],
  streams                 text[],
  is_principal_teaching   boolean DEFAULT false,
  is_hod_for_this_subject boolean DEFAULT false,
  term                    integer,
  academic_year           text,
  is_active               boolean DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  UNIQUE(school_id, teacher_id, subject_name, term, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_tsa_teacher
  ON public.teacher_subject_assignments(teacher_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tsa_school_dept
  ON public.teacher_subject_assignments(school_id, department);

ALTER TABLE public.teacher_subject_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tsa_school"   ON public.teacher_subject_assignments;
DROP POLICY IF EXISTS "tsa_service"  ON public.teacher_subject_assignments;

CREATE POLICY "tsa_school" ON public.teacher_subject_assignments
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "tsa_service" ON public.teacher_subject_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Nkoroi seed: Rita Thiringi (principal) as subject teacher ─────────────────
-- Rita teaches Mathematics (update subject if different)

INSERT INTO public.teacher_subject_assignments (
  school_id, teacher_id, subject_name, department,
  curriculum_type, is_principal_teaching, term, academic_year, is_active
)
SELECT
  '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid,
  sr.id,
  'Mathematics',
  'mathematics',
  '844',
  true,
  2,
  '2025/2026',
  true
FROM public.staff_records sr
WHERE sr.school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND sr.sub_role = 'principal'
ON CONFLICT DO NOTHING;

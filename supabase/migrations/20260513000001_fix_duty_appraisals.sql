-- Create exam_results table (was referenced in code but never migrated)
CREATE TABLE IF NOT EXISTS public.exam_results (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    uuid NOT NULL,
  student_id   text NOT NULL,       -- students.id
  subject      text NOT NULL,
  score        numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  exam_type    text NOT NULL,       -- CAT 1, CAT 2, Mock, End of Term, etc.
  term         smallint NOT NULL CHECK (term BETWEEN 1 AND 3),
  created_by   text,                -- staff_records.id
  created_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_results_select_school" ON public.exam_results
  FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

CREATE POLICY "exam_results_insert_school" ON public.exam_results
  FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "exam_results_update_school" ON public.exam_results
  FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS exam_results_school_term
  ON public.exam_results (school_id, term, exam_type);

CREATE INDEX IF NOT EXISTS exam_results_student
  ON public.exam_results (student_id);

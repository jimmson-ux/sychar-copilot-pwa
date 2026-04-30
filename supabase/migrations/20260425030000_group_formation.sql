-- ============================================================
-- Group Formation Engine
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_groups (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid        NOT NULL,
  class_name      text        NOT NULL,
  stream_name     text,
  subject_name    text        NOT NULL,
  teacher_id      uuid        NOT NULL REFERENCES public.staff_records(id),
  term            integer     CHECK (term IN (1,2,3)),
  academic_year   text        NOT NULL,
  exam_type       text,
  groups          jsonb       NOT NULL DEFAULT '[]',
  formation_type  text        DEFAULT 'mixed'
                  CHECK (formation_type IN ('mixed','homogeneous','rotating')),
  rotation_week   integer     DEFAULT 1,
  ai_rationale    text,
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_groups_class
  ON public.student_groups(school_id, class_name, subject_name, term);

ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_school" ON public.student_groups;
CREATE POLICY "groups_school" ON public.student_groups
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "groups_service" ON public.student_groups;
CREATE POLICY "groups_service" ON public.student_groups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

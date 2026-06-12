-- ================================================================
-- SMART SUBSTITUTION (relief lesson allocator)
-- 2026-06-12
--
-- When a teacher is absent, the system finds a same-department peer free at that
-- slot, attaches the absent teacher's next planned topic, and notifies the relief
-- teacher. Records the allocation here. (Attendance reconciliation reuses the
-- existing lesson_attendance_alerts table — no new table needed.)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.substitution_assignments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid        NOT NULL REFERENCES public.schools(id)       ON DELETE CASCADE,
  absent_teacher_id    uuid        REFERENCES public.staff_records(id)          ON DELETE SET NULL,
  substitute_teacher_id uuid       REFERENCES public.staff_records(id)          ON DELETE SET NULL,
  timetable_period_id  uuid,
  duty_date            date        NOT NULL,
  subject              text,
  class_name           text,
  topic                text,       -- pulled from the absent teacher's lesson plan
  sub_topic            text,
  outcomes             text,
  status               text        NOT NULL DEFAULT 'assigned'
                       CHECK (status IN ('assigned','unassigned','declined','completed')),
  created_by           uuid        REFERENCES public.staff_records(id)          ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_substitution_school_date
  ON public.substitution_assignments (school_id, duty_date DESC);

ALTER TABLE public.substitution_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_assign_read    ON public.substitution_assignments;
DROP POLICY IF EXISTS sub_assign_admin   ON public.substitution_assignments;
DROP POLICY IF EXISTS sub_assign_service ON public.substitution_assignments;

-- Staff read their own school's assignments (so a substitute sees their relief duty).
CREATE POLICY sub_assign_read ON public.substitution_assignments
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

-- Leadership / dean manage.
CREATE POLICY sub_assign_admin ON public.substitution_assignments
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
                                 'deputy_principal_admin','dean_of_studies','super_admin')
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
                                 'deputy_principal_admin','dean_of_studies','super_admin')
  );

CREATE POLICY sub_assign_service ON public.substitution_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FINALIZE 2026-06-12 — run once in Supabase SQL Editor (project xwgtsldimlrhtgvpnjnd).
-- Applies department_meetings, Oloolaiser reference docs, confirms cap, and reloads PostgREST cache.

-- ================================================================
-- DEPARTMENT MEETINGS (HOD summons + delegated minutes) — all schools
-- 2026-06-12
--
-- An HOD summons their department to a meeting (web push), delegates minute-taking
-- to a department member, and the submitted summary is escalated to the deputy
-- principals + principal. Applies across every tenant via school_id scoping.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.department_meetings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  hod_id          uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  department      text        NOT NULL,
  title           text        NOT NULL,
  agenda          text,
  scheduled_at    timestamptz,
  location        text,
  minute_taker_id uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','in_progress','minuted','closed')),
  summary         text,                              -- the minutes / meeting summary
  decisions       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  attendees       jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- recorded present
  minuted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dept_meetings_school
  ON public.department_meetings (school_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_dept_meetings_dept
  ON public.department_meetings (school_id, department);

ALTER TABLE public.department_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dept_meetings_read    ON public.department_meetings;
DROP POLICY IF EXISTS dept_meetings_manage  ON public.department_meetings;
DROP POLICY IF EXISTS dept_meetings_service ON public.department_meetings;

-- Any staff of the school may READ meetings (members need to see they're summoned;
-- leadership see all). School-scoped.
CREATE POLICY dept_meetings_read ON public.department_meetings
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

-- HODs + leadership create/manage; the assigned minute taker updates via service role.
CREATE POLICY dept_meetings_manage ON public.department_meetings
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND (public.get_my_role() LIKE 'hod_%'
         OR public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic','deputy_principal_admin','super_admin','dean_of_studies'))
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND (public.get_my_role() LIKE 'hod_%'
         OR public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic','deputy_principal_admin','super_admin','dean_of_studies'))
  );

CREATE POLICY dept_meetings_service ON public.department_meetings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Oloolaiser reference docs
INSERT INTO public.school_reference_docs (school_id, doc_type, title, content) VALUES
('d228b049-1185-4bf5-9577-52f7f9c714e9','school_rules','School Rules & Regulations','{"rules":["Respect and obey teachers, staff, prefects and authority.","No smoking, alcohol or drugs of addiction.","Full school uniform at all times.","Games compulsory; register for a sport.","Adhere to the daily routine.","No fighting, stealing or anti-social behaviour.","No phones, radios, flash disks or gambling items.","Channel grievances through prefects/class teacher/TOD.","Use Kiswahili and English at all times.","In school by 6:50 AM; leave not before 5:00 PM.","No absence without parent permission."]}'::jsonb),
('d228b049-1185-4bf5-9577-52f7f9c714e9','cbe_combinations','CBE Subject Combinations','{"pathways":["Arts and Sports Science","Social Sciences","STEM"],"total_lessons":40}'::jsonb),
('d228b049-1185-4bf5-9577-52f7f9c714e9','duty_rota','Teacher on Duty Rota 2026','{"operational_hours":{"day":"06:30-17:30","night":"17:30-06:30"}}'::jsonb)
ON CONFLICT (school_id, doc_type) DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title, updated_at = now();

UPDATE public.tenant_configs SET genesis_max_delegates = 2 WHERE school_id = 'd228b049-1185-4bf5-9577-52f7f9c714e9';

-- Refresh PostgREST so the new table/columns become visible immediately:
NOTIFY pgrst, 'reload schema';

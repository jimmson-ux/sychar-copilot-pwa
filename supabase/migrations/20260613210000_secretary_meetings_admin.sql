-- ================================================================
-- MEETINGS + MINUTES (all schools) + SECRETARY ADMIN HUB (Oloolaiser-gated)
-- 2026-06-13
--
-- 1. `meetings` — general meetings + minutes for EVERY school (BOM, staff, department,
--    PTA, academic). Supersedes department_meetings; the HOD flow uses type='department'.
-- 2. Secretary administrative-hub tables (correspondence, deliveries, principal digital
--    desk, internal tasks). School-scoped; surfaced for Oloolaiser via features.secretary_module.
-- Isolation: every table is school_id-scoped with strict RLS.
-- ================================================================

-- ── 1. General meetings + minutes (ALL schools) ─────────────────
CREATE TABLE IF NOT EXISTS public.meetings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  meeting_type    text        NOT NULL DEFAULT 'department'
                  CHECK (meeting_type IN ('bom','staff','department','pta','academic','committee','other')),
  department      text,                                  -- for department meetings
  title           text        NOT NULL,
  agenda          text,
  scheduled_at    timestamptz,
  venue           text,
  convener_id     uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  minute_taker_id uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  attendees       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  summary         text,                                  -- the minutes
  decisions       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status          text        NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','in_progress','minuted','closed')),
  minuted_at      timestamptz,
  created_by      uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_school ON public.meetings (school_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_type   ON public.meetings (school_id, meeting_type);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meetings_read ON public.meetings;
DROP POLICY IF EXISTS meetings_manage ON public.meetings;
DROP POLICY IF EXISTS meetings_service ON public.meetings;

CREATE POLICY meetings_read ON public.meetings
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

-- HOD / secretary / leadership convene + manage.
CREATE POLICY meetings_manage ON public.meetings
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND (public.get_my_role() LIKE 'hod_%'
         OR public.get_my_role() IN ('secretary','principal','deputy_principal','deputy_principal_academic',
            'deputy_principal_admin','super_admin','dean_of_studies','dean_of_students'))
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND (public.get_my_role() LIKE 'hod_%'
         OR public.get_my_role() IN ('secretary','principal','deputy_principal','deputy_principal_academic',
            'deputy_principal_admin','super_admin','dean_of_studies','dean_of_students'))
  );

CREATE POLICY meetings_service ON public.meetings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Secretary administrative-hub tables ──────────────────────
-- Reusable RLS predicate: secretary + leadership of the school.
-- (helper inlined per-policy to avoid a new SQL function dependency.)

CREATE TABLE IF NOT EXISTS public.secretary_correspondence (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  direction       text        NOT NULL CHECK (direction IN ('incoming','outgoing')),
  party           text        NOT NULL,                  -- sender (incoming) / recipient (outgoing)
  subject         text        NOT NULL,
  correspondence_date date     NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Nairobi')::date,
  delivery_method text,                                  -- email/courier/hand/post
  attachment_url  text,
  status          text        NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received','forwarded','actioned','closed','sent')),
  assigned_to     uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  notes           text,
  created_by      uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_correspondence_school ON public.secretary_correspondence (school_id, correspondence_date DESC);

CREATE TABLE IF NOT EXISTS public.school_deliveries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  courier       text,
  package_desc  text        NOT NULL,
  recipient     text,
  received_by   uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_school ON public.school_deliveries (school_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.principal_digital_desk (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title              text        NOT NULL,
  source             text,                               -- e.g. Ministry, Parent, BOM
  document_url       text,
  assigned_officer_id uuid       REFERENCES public.staff_records(id) ON DELETE SET NULL,
  status             text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','in_progress','completed')),
  notes              text,
  uploaded_by        uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_digital_desk_school ON public.principal_digital_desk (school_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.secretary_tasks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  assigned_to   uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  due_date      date,
  status        text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_by    uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sec_tasks_school ON public.secretary_tasks (school_id, status, due_date);

-- RLS for the four secretary tables: secretary + leadership of the school.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['secretary_correspondence','school_deliveries','principal_digital_desk','secretary_tasks']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_rw ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_rw ON public.%I FOR ALL TO authenticated
      USING (school_id::text = public.get_my_school_id()::text
             AND public.get_my_role() IN ('secretary','principal','deputy_principal','deputy_principal_academic','deputy_principal_admin','super_admin'))
      WITH CHECK (school_id::text = public.get_my_school_id()::text
             AND public.get_my_role() IN ('secretary','principal','deputy_principal','deputy_principal_academic','deputy_principal_admin','super_admin'))
    $f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

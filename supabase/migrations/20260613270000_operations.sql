-- ================================================================
-- OPERATIONS & OVERSIGHT — all schools · 2026-06-13 · Sprint 6
--
-- Maintenance + general incident reporting (real-time to leadership), supplier
-- contracts (Oloolaiser/procurement), dormitory/boarding. Reuses existing
-- support_tickets/ticket_analytics (help centre), notices (comms), duty_appraisals.
-- Every table school_id-scoped with RLS.
-- ================================================================

-- ── Maintenance requests (any staff reports; assigned + verified) ──
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  reported_by  uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  location     text,
  category     text,                                   -- electrical/plumbing/furniture/ICT/structural/other
  description  text NOT NULL,
  priority     text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','emergency')),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','completed','verified')),
  assigned_to  uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  photo_url    text,
  completed_at timestamptz,
  verified_by  uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_school ON public.maintenance_requests (school_id, status, priority);

-- ── General incident reports (real-time to principal + deputies) ──
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  reported_by      uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  incident_type    text NOT NULL,                      -- student_fight/accident/property_damage/safety_hazard/other
  description      text NOT NULL,
  location         text,
  severity         text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  students_involved jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_taken     text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  photo_url        text,
  occurred_at      timestamptz,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_school ON public.incident_reports (school_id, status, created_at DESC);

-- ── Supplier contracts (procurement; Oloolaiser-gated by UI) ──
CREATE TABLE IF NOT EXISTS public.supplier_contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  supplier_id    uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category       text,
  start_date     date,
  end_date       date,
  contract_value numeric(14,2),
  document_url   text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expiring','expired','terminated')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_school ON public.supplier_contracts (school_id, end_date);

-- ── Dormitories + assignments (boarding) ──
CREATE TABLE IF NOT EXISTS public.dormitories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name          text NOT NULL,
  capacity      integer,
  housemaster_id uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE TABLE IF NOT EXISTS public.dorm_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  dormitory_id uuid REFERENCES public.dormitories(id) ON DELETE CASCADE,
  student_id   uuid REFERENCES public.students(id) ON DELETE CASCADE,
  bed_number   text,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  released_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_dorm_assign_school ON public.dorm_assignments (school_id, dormitory_id);

-- ── RLS ──
-- maintenance + incident: ANY school staff may report (insert) + read own school;
-- leadership/assigned manage. supplier_contracts + dorms: procurement/storekeeper/
-- boarding/leadership manage; school staff read.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['maintenance_requests','incident_reports','supplier_contracts','dormitories','dorm_assignments']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated
      USING (school_id::text = public.get_my_school_id()::text)
    $f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Any staff may file a maintenance request / incident report for their school.
DROP POLICY IF EXISTS maintenance_requests_insert ON public.maintenance_requests;
CREATE POLICY maintenance_requests_insert ON public.maintenance_requests
  FOR INSERT TO authenticated WITH CHECK (school_id::text = public.get_my_school_id()::text);
DROP POLICY IF EXISTS maintenance_requests_update ON public.maintenance_requests;
CREATE POLICY maintenance_requests_update ON public.maintenance_requests
  FOR UPDATE TO authenticated USING (school_id::text = public.get_my_school_id()::text);

DROP POLICY IF EXISTS incident_reports_insert ON public.incident_reports;
CREATE POLICY incident_reports_insert ON public.incident_reports
  FOR INSERT TO authenticated WITH CHECK (school_id::text = public.get_my_school_id()::text);
DROP POLICY IF EXISTS incident_reports_update ON public.incident_reports;
CREATE POLICY incident_reports_update ON public.incident_reports
  FOR UPDATE TO authenticated USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
        'deputy_principal_admin','super_admin','dean_of_students','secretary'));

-- Procurement/leadership manage contracts; procurement/storekeeper/boarding/leadership manage dorms.
DROP POLICY IF EXISTS supplier_contracts_manage ON public.supplier_contracts;
CREATE POLICY supplier_contracts_manage ON public.supplier_contracts
  FOR ALL TO authenticated
  USING (school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('procurement_officer','principal','deputy_principal','deputy_principal_admin','super_admin','bursar'))
  WITH CHECK (school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('procurement_officer','principal','deputy_principal','deputy_principal_admin','super_admin','bursar'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dormitories','dorm_assignments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_manage ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_manage ON public.%I FOR ALL TO authenticated
      USING (school_id::text = public.get_my_school_id()::text
        AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_admin','super_admin','dean_of_students','secretary'))
      WITH CHECK (school_id::text = public.get_my_school_id()::text
        AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_admin','super_admin','dean_of_students','secretary'))
    $f$, t, t);
  END LOOP;
END $$;

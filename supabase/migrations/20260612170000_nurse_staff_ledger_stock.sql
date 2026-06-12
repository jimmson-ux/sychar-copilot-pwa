-- ================================================================
-- NURSE: STAFF PATIENT LEDGER + MEDICATION STOCK + PARENT NOTIFICATIONS
-- 2026-06-12
--
-- Oloolaiser's nurse also treats teaching & non-teaching STAFF. Their records are
-- kept in a SEPARATE ledger (doctor–patient confidentiality: the principal may NOT
-- see staff patients by name) but draw from the SAME medication stock as student
-- visits so stock reconciliation is unified.
--
-- Also: per-child health notifications to parents (strict student→parent mapping),
-- and medication-issued time = end of visit.
-- ================================================================

-- ── 1. Staff patient ledger (confidential) ──────────────────────
CREATE TABLE IF NOT EXISTS public.staff_patient_visits (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  patient_staff_id    uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  staff_type          text        NOT NULL DEFAULT 'teaching' CHECK (staff_type IN ('teaching','non_teaching')),
  complaint           text        NOT NULL,
  action_taken        text        NOT NULL,
  notes               text,
  vitals              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  nurse_findings      text,
  management_provided jsonb       NOT NULL DEFAULT '[]'::jsonb,
  medication_items    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  referral_to         text,
  follow_up_plan      text,
  seen_by             uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  visit_started_at    timestamptz NOT NULL DEFAULT now(),
  medication_issued_at timestamptz,     -- set when nurse confirms "issued medication" = end of visit
  during_class_hours  boolean     NOT NULL DEFAULT false,  -- Phase 9: visited during a teaching period
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_patient_visits_school
  ON public.staff_patient_visits (school_id, visit_started_at DESC);

ALTER TABLE public.staff_patient_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_patient_nurse   ON public.staff_patient_visits;
DROP POLICY IF EXISTS staff_patient_self    ON public.staff_patient_visits;
DROP POLICY IF EXISTS staff_patient_service ON public.staff_patient_visits;

-- ONLY the nurse may read/write staff patient records (NOT the principal — confidentiality).
CREATE POLICY staff_patient_nurse ON public.staff_patient_visits
  FOR ALL TO authenticated
  USING (school_id::text = public.get_my_school_id()::text AND public.get_my_role() = 'nurse')
  WITH CHECK (school_id::text = public.get_my_school_id()::text AND public.get_my_role() = 'nurse');

-- A staff member may read their OWN visits.
CREATE POLICY staff_patient_self ON public.staff_patient_visits
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND patient_staff_id IN (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text)
  );

CREATE POLICY staff_patient_service ON public.staff_patient_visits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Medication stock (shared by student + staff visits) ───────
CREATE TABLE IF NOT EXISTS public.nurse_medications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  unit          text        DEFAULT 'unit',
  stock_qty     numeric     NOT NULL DEFAULT 0,
  reorder_level numeric     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.nurse_stock_movements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  medication_id uuid        REFERENCES public.nurse_medications(id) ON DELETE SET NULL,
  change_qty    numeric     NOT NULL,    -- negative = issued, positive = restock
  reason        text        NOT NULL CHECK (reason IN ('issue','restock','adjustment','requisition')),
  patient_kind  text        CHECK (patient_kind IN ('student','staff')),
  visit_id      uuid,                    -- sick_bay_visits.id OR staff_patient_visits.id
  created_by    uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nurse_stock_movements_school
  ON public.nurse_stock_movements (school_id, created_at DESC);

ALTER TABLE public.nurse_medications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurse_stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nurse_meds_rw      ON public.nurse_medications;
DROP POLICY IF EXISTS nurse_meds_service ON public.nurse_medications;
DROP POLICY IF EXISTS nurse_moves_rw      ON public.nurse_stock_movements;
DROP POLICY IF EXISTS nurse_moves_service ON public.nurse_stock_movements;

-- Nurse + leadership manage stock (stock levels are NOT confidential; patient identity is).
CREATE POLICY nurse_meds_rw ON public.nurse_medications
  FOR ALL TO authenticated
  USING (school_id::text = public.get_my_school_id()::text
         AND public.get_my_role() IN ('nurse','principal','deputy_principal','deputy_principal_admin','super_admin'))
  WITH CHECK (school_id::text = public.get_my_school_id()::text
         AND public.get_my_role() IN ('nurse','principal','deputy_principal','deputy_principal_admin','super_admin'));
CREATE POLICY nurse_meds_service ON public.nurse_medications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY nurse_moves_rw ON public.nurse_stock_movements
  FOR ALL TO authenticated
  USING (school_id::text = public.get_my_school_id()::text
         AND public.get_my_role() IN ('nurse','principal','deputy_principal','deputy_principal_admin','super_admin'))
  WITH CHECK (school_id::text = public.get_my_school_id()::text
         AND public.get_my_role() IN ('nurse','principal','deputy_principal','deputy_principal_admin','super_admin'));
CREATE POLICY nurse_moves_service ON public.nurse_stock_movements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Per-child parent health notifications (strict mapping) ────
CREATE TABLE IF NOT EXISTS public.parent_health_notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid        NOT NULL REFERENCES public.schools(id)   ON DELETE CASCADE,
  student_id   uuid        NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  parent_id    uuid        NOT NULL,
  visit_id     uuid,
  title        text        NOT NULL,
  body         text        NOT NULL,
  is_read      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_health_notif_parent
  ON public.parent_health_notifications (parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_health_notif_student
  ON public.parent_health_notifications (student_id, created_at DESC);

ALTER TABLE public.parent_health_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_health_notif_service ON public.parent_health_notifications;
-- Written by service role (nurse flow); parent reads via the wazazi PWA (service-role API there).
CREATE POLICY parent_health_notif_service ON public.parent_health_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. Medication-issued time on student visits ─────────────────
ALTER TABLE public.sick_bay_visits
  ADD COLUMN IF NOT EXISTS medication_items     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS medication_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS during_class_hours   boolean     NOT NULL DEFAULT false;

-- ── 5. Confidentiality-aware summaries ──────────────────────────
-- Students (minors): names + class + admission allowed for the principal.
CREATE OR REPLACE FUNCTION public.nurse_student_summary(
  p_school_id uuid,
  p_from      date DEFAULT (now() AT TIME ZONE 'Africa/Nairobi')::date - 30,
  p_to        date DEFAULT (now() AT TIME ZONE 'Africa/Nairobi')::date
)
RETURNS TABLE (complaint text, visits integer, students jsonb)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    v.complaint,
    COUNT(*)::int AS visits,
    jsonb_agg(DISTINCT jsonb_build_object(
      'name', s.full_name, 'class', s.class_name, 'admission_no', s.admission_number
    )) AS students
  FROM public.sick_bay_visits v
  LEFT JOIN public.students s ON s.id = v.student_id
  WHERE v.school_id = p_school_id
    AND (v.admitted_at AT TIME ZONE 'Africa/Nairobi')::date BETWEEN p_from AND p_to
  GROUP BY v.complaint
  ORDER BY visits DESC;
$$;

-- Staff: AGGREGATE ONLY — no names, no ids (doctor–patient confidentiality).
CREATE OR REPLACE FUNCTION public.nurse_staff_summary(
  p_school_id uuid,
  p_from      date DEFAULT (now() AT TIME ZONE 'Africa/Nairobi')::date - 30,
  p_to        date DEFAULT (now() AT TIME ZONE 'Africa/Nairobi')::date
)
RETURNS TABLE (complaint text, visits integer)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT v.complaint, COUNT(*)::int AS visits
  FROM public.staff_patient_visits v
  WHERE v.school_id = p_school_id
    AND (v.visit_started_at AT TIME ZONE 'Africa/Nairobi')::date BETWEEN p_from AND p_to
  GROUP BY v.complaint
  ORDER BY visits DESC;
$$;

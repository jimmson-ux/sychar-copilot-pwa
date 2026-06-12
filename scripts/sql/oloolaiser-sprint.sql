-- Oloolaiser/Genesis sprint — combined idempotent DDL (2026-06-12)
-- Paste into Supabase SQL Editor (project xwgtsldimlrhtgvpnjnd) and Run. Safe to re-run.

-- ============================================================
-- 20260612120000_genesis_delegations.sql
-- ============================================================
-- ================================================================
-- GENESIS DELEGATION — principal-delegable QR generation & geofence locking
-- 2026-06-12
--
-- Until now, who could generate the per-class lesson-attendance QR
-- (and who could lock a classroom geofence) was hard-coded to a fixed
-- set of roles in application code. Principals could not delegate the
-- task to a trusted staff member of their choosing.
--
-- This migration introduces a per-staff capability grant:
--   * genesis_delegations          — explicit grants by the principal
--   * tenant_configs.genesis_max_delegates — per-school cap on extra delegates
--                                     (NULL = unlimited; e.g. Oloolaiser = 2)
--   * has_genesis_capability()     — single source of truth used by the API
--                                     and edge functions for authorization.
--
-- The deputy principal (and principal/super_admin) are ALWAYS implicitly
-- allowed and do NOT count against genesis_max_delegates.
-- ================================================================

-- ── 1. Per-school delegate cap ──────────────────────────────────
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS genesis_max_delegates integer;
COMMENT ON COLUMN public.tenant_configs.genesis_max_delegates IS
  'Max ADDITIONAL Genesis delegates the principal may appoint (beyond deputy/principal). NULL = unlimited.';

-- ── 2. Delegation grants ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genesis_delegations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  staff_id    uuid        NOT NULL REFERENCES public.staff_records(id)  ON DELETE CASCADE,
  capability  text        NOT NULL CHECK (capability IN ('generate_qr','lock_geofence')),
  granted_by  uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  is_active   boolean     NOT NULL DEFAULT true
);

-- One active grant per (school, staff, capability). Re-granting reactivates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_genesis_delegation_active
  ON public.genesis_delegations (school_id, staff_id, capability)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_genesis_delegation_school
  ON public.genesis_delegations (school_id, capability, is_active);

ALTER TABLE public.genesis_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS genesis_deleg_admin_all ON public.genesis_delegations;
DROP POLICY IF EXISTS genesis_deleg_self_read ON public.genesis_delegations;
DROP POLICY IF EXISTS genesis_deleg_service   ON public.genesis_delegations;

-- Principal / super_admin of the school manage grants.
CREATE POLICY genesis_deleg_admin_all ON public.genesis_delegations
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','super_admin')
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','super_admin')
  );

-- Any staff may see their own grants (so the UI can show "you can generate QR").
CREATE POLICY genesis_deleg_self_read ON public.genesis_delegations
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND staff_id IN (
      SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY genesis_deleg_service ON public.genesis_delegations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Capability check — single source of truth ────────────────
-- Returns true when the given staff member may perform the capability:
--   * implicit leadership roles (always), OR
--   * legacy default roles for that capability, OR
--   * an explicit active delegation grant.
CREATE OR REPLACE FUNCTION public.has_genesis_capability(
  p_staff_id  uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_records s
    WHERE s.id = p_staff_id
      AND (
        -- Implicit leadership: always allowed for both capabilities.
        s.sub_role IN ('principal','super_admin','deputy_principal',
                       'deputy_principal_academic','deputy_principal_admin')
        -- Legacy default generators (kept for backwards compatibility).
        OR (p_capability = 'generate_qr'
            AND s.sub_role IN ('deputy_principal','deputy_principal_academic','dean_of_studies'))
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.genesis_delegations d
    WHERE d.staff_id   = p_staff_id
      AND d.capability = p_capability
      AND d.is_active  = true
      AND d.revoked_at IS NULL
  );
$$;

-- ── 4. Relax class_qr_tokens.generator_role CHECK ───────────────
-- The 3-role enum no longer reflects reality now that the principal can
-- delegate QR generation to any staff member. We keep the column (for audit
-- of WHICH role generated each QR) but drop the restrictive CHECK.
ALTER TABLE public.class_qr_tokens
  DROP CONSTRAINT IF EXISTS class_qr_tokens_generator_role_check;

-- ── 5. Widen QR-token RLS to capability holders ─────────────────
-- The previous "qr_deputy_all" policy only allowed the 3 legacy roles +
-- principal/super_admin. Delegated staff write via the service role (API
-- route) so this is belt-and-braces, but we align it with the new model.
DROP POLICY IF EXISTS qr_deputy_all ON public.class_qr_tokens;
CREATE POLICY qr_deputy_all ON public.class_qr_tokens
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.has_genesis_capability(
      (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text LIMIT 1),
      'generate_qr'
    )
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.has_genesis_capability(
      (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text LIMIT 1),
      'generate_qr'
    )
  );

-- ============================================================
-- 20260612130000_school_reference_docs.sql
-- ============================================================
-- ================================================================
-- SCHOOL REFERENCE DOCS + GENDER PROFILE
-- 2026-06-12
--
-- Two small additions needed by Oloolaiser onboarding (and reusable by all):
--
-- 1. school_reference_docs — structured, non-operational config documents
--    (school rules, CBE subject combinations, duty rota, etc.) stored as JSONB
--    so dashboards and the RAG indexer can read them per school.
--
-- 2. gender_profile — marks single-gender schools so the AI frames discipline,
--    performance and mental-health analysis appropriately (Oloolaiser = boys).
--    Stored on both school_metadata (frontend SchoolContext) and tenant_configs
--    (server-side reads) to match the platform's dual feature-store pattern.
-- ================================================================

-- ── 1. Reference documents ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_reference_docs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  doc_type    text        NOT NULL,   -- 'school_rules' | 'cbe_combinations' | 'duty_rota' | ...
  title       text,
  content     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_school_reference_docs_school
  ON public.school_reference_docs (school_id, doc_type);

ALTER TABLE public.school_reference_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_ref_docs_read    ON public.school_reference_docs;
DROP POLICY IF EXISTS school_ref_docs_admin   ON public.school_reference_docs;
DROP POLICY IF EXISTS school_ref_docs_service ON public.school_reference_docs;

-- Any staff of the school may read reference docs (rules, combos, rota are not sensitive).
CREATE POLICY school_ref_docs_read ON public.school_reference_docs
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

-- Leadership may edit.
CREATE POLICY school_ref_docs_admin ON public.school_reference_docs
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
                                 'deputy_principal_admin','super_admin','dean_of_studies')
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
                                 'deputy_principal_admin','super_admin','dean_of_studies')
  );

CREATE POLICY school_ref_docs_service ON public.school_reference_docs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Gender profile ───────────────────────────────────────────
-- 'mixed' (default) | 'boys' | 'girls'
ALTER TABLE public.school_metadata
  ADD COLUMN IF NOT EXISTS gender_profile text NOT NULL DEFAULT 'mixed'
    CHECK (gender_profile IN ('mixed','boys','girls'));

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS gender_profile text NOT NULL DEFAULT 'mixed'
    CHECK (gender_profile IN ('mixed','boys','girls'));

-- ============================================================
-- 20260612140000_nurse_module.sql
-- ============================================================
-- ================================================================
-- SCHOOL NURSE MODULE
-- 2026-06-12
--
-- /api/nurse/visits and the nurse dashboard already reference a sick_bay_visits
-- table that was never migrated. This formalizes it (matching the columns the API
-- writes), adds nurse_referrals, a daily-summary RPC, and RLS.
--
-- Gated per-tenant by features.school_nurse (Oloolaiser is the first school with
-- a nurse; future schools simply flip the flag).
-- ================================================================

-- ── 1. Sick bay visits ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sick_bay_visits (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  student_id              uuid        REFERENCES public.students(id)                ON DELETE SET NULL,
  -- Core fields used by /api/nurse/visits today:
  complaint               text        NOT NULL,
  action_taken            text        NOT NULL,   -- 'Observation' | 'First Aid' | 'Bed Rest' | 'Sent Home' | 'Referred' ...
  notes                   text,
  is_in_bay               boolean     NOT NULL DEFAULT false,
  seen_by                 uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  parent_notified         boolean     NOT NULL DEFAULT false,
  teacher_notified        boolean     NOT NULL DEFAULT false,
  gate_log_updated        boolean     NOT NULL DEFAULT false,
  admitted_at             timestamptz NOT NULL DEFAULT now(),
  discharged_at           timestamptz,
  -- Richer health-record fields (School Nurse template — Phase 5):
  vitals                  jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {temp,pulse,bp,resp,weight}
  observations            jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ['Appears Ill','Anxious',...]
  nurse_findings          text,
  psychosomatic_indicators jsonb      NOT NULL DEFAULT '[]'::jsonb,   -- ['Examination Stress','Homesickness',...]
  management_provided     jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ['First Aid','Rest','Medication',...]
  referral_to             text,       -- 'Guidance & Counselling' | 'Parent/Guardian' | 'Hospital' | ...
  follow_up_plan          text,       -- 'Review in 24 Hours' | 'Ongoing Monitoring' | ...
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sick_bay_school_inbay
  ON public.sick_bay_visits (school_id, is_in_bay, admitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sick_bay_school_admitted
  ON public.sick_bay_visits (school_id, admitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sick_bay_student
  ON public.sick_bay_visits (student_id, admitted_at DESC);
-- Frequent-attender + outbreak queries scan (school, complaint, date):
CREATE INDEX IF NOT EXISTS idx_sick_bay_complaint
  ON public.sick_bay_visits (school_id, complaint, admitted_at DESC);

ALTER TABLE public.sick_bay_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sick_bay_staff_rw ON public.sick_bay_visits;
DROP POLICY IF EXISTS sick_bay_service  ON public.sick_bay_visits;

-- Nurse + leadership read/write their own school's records (medical confidentiality).
CREATE POLICY sick_bay_staff_rw ON public.sick_bay_visits
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('nurse','principal','deputy_principal',
                                 'deputy_principal_admin','super_admin')
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('nurse','principal','deputy_principal',
                                 'deputy_principal_admin','super_admin')
  );

CREATE POLICY sick_bay_service ON public.sick_bay_visits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Nurse referrals (mental-health / G&C / hospital log) ──────
CREATE TABLE IF NOT EXISTS public.nurse_referrals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid        NOT NULL REFERENCES public.schools(id)         ON DELETE CASCADE,
  visit_id      uuid        REFERENCES public.sick_bay_visits(id)          ON DELETE SET NULL,
  student_id    uuid        REFERENCES public.students(id)                 ON DELETE SET NULL,
  concern       text        NOT NULL,
  referred_to   text        NOT NULL CHECK (referred_to IN ('gc','parent','hospital','admin','boarding','mental_health')),
  outcome       text,
  referred_by   uuid        REFERENCES public.staff_records(id)            ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nurse_referrals_school
  ON public.nurse_referrals (school_id, created_at DESC);

ALTER TABLE public.nurse_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nurse_referrals_rw      ON public.nurse_referrals;
DROP POLICY IF EXISTS nurse_referrals_service ON public.nurse_referrals;

-- Nurse + leadership + counselor (G&C referrals land here) read/write own school.
CREATE POLICY nurse_referrals_rw ON public.nurse_referrals
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('nurse','principal','deputy_principal',
                                 'deputy_principal_admin','super_admin',
                                 'guidance_counselling','counselor')
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('nurse','principal','deputy_principal',
                                 'deputy_principal_admin','super_admin',
                                 'guidance_counselling','counselor')
  );

CREATE POLICY nurse_referrals_service ON public.nurse_referrals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Daily sick-bay summary RPC ───────────────────────────────
-- Returns the counts shown on the "Daily Sick Bay Summary" for a date.
CREATE OR REPLACE FUNCTION public.nurse_daily_summary(
  p_school_id uuid,
  p_date      date DEFAULT (now() AT TIME ZONE 'Africa/Nairobi')::date
)
RETURNS TABLE (
  students_seen          integer,
  returned_to_class      integer,
  sent_home              integer,
  bed_rest               integer,
  referred_hospital      integer,
  referred_counselling   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE action_taken IN ('Returned to Class','Observation','First Aid'))::int,
    COUNT(*) FILTER (WHERE action_taken = 'Sent Home')::int,
    COUNT(*) FILTER (WHERE action_taken = 'Bed Rest')::int,
    COUNT(*) FILTER (WHERE referral_to ILIKE '%hospital%')::int,
    COUNT(*) FILTER (WHERE referral_to ILIKE '%counsel%')::int
  FROM public.sick_bay_visits
  WHERE school_id = p_school_id
    AND (admitted_at AT TIME ZONE 'Africa/Nairobi')::date = p_date;
$$;

-- ============================================================
-- 20260612150000_gate_shift_fingerprint_exeat.sql
-- ============================================================
-- ================================================================
-- GATE SHIFT (guard ID) + EXEAT STAFF ISSUANCE
-- 2026-06-12
--
-- Oloolaiser is a boarding school with MANY rotating contracted guards (no single
-- permanent gatekeeper). They share a "Gate Control" login, then identify
-- themselves per shift with name + ID number and confirm shift start/end so the
-- system is always aware who is on the gate (day 06:30–17:30, night 17:30–06:30).
--
-- Also lets the Teacher-on-Duty and School Nurse ISSUE exeats (approved by the
-- deputy/principal), tracked via issued_by_role / issuer_staff_id.
-- ================================================================

-- ── 1. Guard ID number on the shift log ─────────────────────────
ALTER TABLE public.gate_shift_log
  ADD COLUMN IF NOT EXISTS guard_id_number text;

-- ── 2. Current open gate shift (the system is "constantly aware") ─
CREATE OR REPLACE FUNCTION public.current_gate_shift(p_school_id uuid)
RETURNS TABLE (
  id              uuid,
  guard_name      text,
  guard_id_number text,
  shift           text,
  started_at      timestamptz,
  minutes_open    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    g.id, g.guard_name, g.guard_id_number, g.shift, g.started_at,
    (EXTRACT(EPOCH FROM (now() - g.started_at)) / 60)::int AS minutes_open
  FROM public.gate_shift_log g
  WHERE g.school_id = p_school_id
    AND g.ended_at IS NULL
  ORDER BY g.started_at DESC
  LIMIT 1;
$$;

-- ── 3. Exeat staff-issuance audit columns ───────────────────────
ALTER TABLE public.exeat_requests
  ADD COLUMN IF NOT EXISTS issued_by_role  text,
  ADD COLUMN IF NOT EXISTS issuer_staff_id uuid REFERENCES public.staff_records(id) ON DELETE SET NULL;

-- ============================================================
-- 20260612160000_tod_daily_report.sql
-- ============================================================
-- ================================================================
-- TEACHER ON DUTY — DAILY REPORT (+ nagging reminder support)
-- 2026-06-12
--
-- Captures the synthesized end-of-day TOD checklist. The tod-reminder cron nags
-- the on-duty teacher if the day's report is unfilled by the cutoff and escalates
-- an unfilled-summary to the deputy & principal.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tod_daily_report (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  teacher_id      uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  duty_date       date        NOT NULL,
  shift           text        DEFAULT 'Day' CHECK (shift IN ('Day','Night')),
  -- Full filled checklist (sections from src/lib/templates/tod.ts) as JSONB:
  report          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at    timestamptz,
  signature       text,       -- auto digital signature on submit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, teacher_id, duty_date, shift)
);

CREATE INDEX IF NOT EXISTS idx_tod_daily_report_school_date
  ON public.tod_daily_report (school_id, duty_date DESC);

ALTER TABLE public.tod_daily_report ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tod_report_own       ON public.tod_daily_report;
DROP POLICY IF EXISTS tod_report_leadership ON public.tod_daily_report;
DROP POLICY IF EXISTS tod_report_service   ON public.tod_daily_report;

-- Duty teacher manages their own report.
CREATE POLICY tod_report_own ON public.tod_daily_report
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND teacher_id IN (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text)
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND teacher_id IN (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text)
  );

-- Leadership reads all reports for the school.
CREATE POLICY tod_report_leadership ON public.tod_daily_report
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_admin','super_admin')
  );

CREATE POLICY tod_report_service ON public.tod_daily_report
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 20260612170000_nurse_staff_ledger_stock.sql
-- ============================================================
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

-- ============================================================
-- 20260612180000_nurse_followup.sql
-- ============================================================
-- ================================================================
-- NURSE FOLLOW-UP TRACKING
-- 2026-06-12
--
-- Supports timely, intelligent follow-up reminders (supabase/functions/nurse-followup).
-- followup_due_at is computed from the visit's follow_up_plan; the cron nags the
-- nurse when it falls due and AI (RAG over patient notes) frames the reminder.
-- ================================================================

ALTER TABLE public.sick_bay_visits
  ADD COLUMN IF NOT EXISTS followup_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_done   boolean NOT NULL DEFAULT false;

ALTER TABLE public.staff_patient_visits
  ADD COLUMN IF NOT EXISTS followup_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_done   boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sick_bay_followup_due
  ON public.sick_bay_visits (school_id, followup_due_at)
  WHERE followup_done = false AND followup_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_visit_followup_due
  ON public.staff_patient_visits (school_id, followup_due_at)
  WHERE followup_done = false AND followup_due_at IS NOT NULL;

-- ============================================================
-- 20260612190000_substitution.sql
-- ============================================================
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


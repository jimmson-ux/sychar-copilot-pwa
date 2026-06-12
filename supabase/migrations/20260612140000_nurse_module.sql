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

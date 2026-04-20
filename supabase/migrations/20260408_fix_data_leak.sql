-- ============================================================
-- DATA LEAK FIX — 2026-04-08
-- Closes four categories of exposure:
--   1. USING (true) on document_inbox + apology_letters
--   2. RLS never enabled on department_codes
--   3. No policy on appraisals (browser INSERT silently fails)
--   4. gerald_flagged_only welfare policy has no school_id scope
--   5. auth.uid()::text type inconsistency in welfare/principal policies
-- ============================================================

-- ── 1. DOCUMENT INBOX & APOLOGY LETTERS ──────────────────────
-- These were created with USING (true) in 20260327_document_scanner.sql
-- and were NOT dropped by 20260327_fix_rls_policies.sql.
-- Any authenticated user could read every school's scanned documents.

DROP POLICY IF EXISTS "service_role_all_document_inbox"  ON public.document_inbox;
DROP POLICY IF EXISTS "service_role_all_apology_letters" ON public.apology_letters;

CREATE POLICY "document_inbox_select_own_school"
  ON public.document_inbox FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "apology_letters_select_own_school"
  ON public.apology_letters FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- apology_letters has no school_id column — add it if missing,
-- then back-fill from the parent document_inbox row.
ALTER TABLE public.apology_letters
  ADD COLUMN IF NOT EXISTS school_id uuid;

UPDATE public.apology_letters al
SET    school_id = di.school_id
FROM   public.document_inbox di
WHERE  al.document_inbox_id = di.id
  AND  al.school_id IS NULL;

-- Drop the just-created policy and recreate now that the column exists
DROP POLICY IF EXISTS "apology_letters_select_own_school" ON public.apology_letters;
CREATE POLICY "apology_letters_select_own_school"
  ON public.apology_letters FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 2. DEPARTMENT CODES ───────────────────────────────────────
-- RLS was never enabled on this table. Any call with the anon
-- key could dump every school's department configuration.

ALTER TABLE public.department_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dept_codes_select_own_school" ON public.department_codes;
CREATE POLICY "dept_codes_select_own_school"
  ON public.department_codes FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 3. APPRAISALS ─────────────────────────────────────────────
-- RLS is ON but no policy exists → default DENY.
-- DutyGradingDashboard.tsx does a direct browser INSERT which silently
-- fails. Adding school-scoped SELECT + INSERT unblocks the feature
-- while keeping data isolated per school.

ALTER TABLE public.appraisals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appraisals_select_own_school" ON public.appraisals;
CREATE POLICY "appraisals_select_own_school"
  ON public.appraisals FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "appraisals_insert_own_school" ON public.appraisals;
CREATE POLICY "appraisals_insert_own_school"
  ON public.appraisals FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "appraisals_update_own_school" ON public.appraisals;
CREATE POLICY "appraisals_update_own_school"
  ON public.appraisals FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 4. WELFARE LOGS — CROSS-SCHOOL SCOPE FIX ─────────────────
-- The "gerald_flagged_only" policy joined principal_flags without
-- restricting to the same school_id. A deputy_principal_discipline
-- at School A could theoretically read welfare notes from School B
-- if a student UUID happened to match.

DROP POLICY IF EXISTS "gerald_flagged_only" ON public.welfare_logs;
CREATE POLICY "gerald_flagged_only" ON public.welfare_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM   public.staff_records sr
      JOIN   public.principal_flags pf
             ON  pf.student_id  = welfare_logs.student_id
             AND pf.school_id   = welfare_logs.school_id   -- school scope
      WHERE  sr.user_id   = auth.uid()
        AND  sr.sub_role  = 'deputy_principal_discipline'
        AND  sr.school_id = welfare_logs.school_id          -- school scope
        AND  pf.status   != 'open'
    )
  );

-- ── 5. TYPE-CONSISTENCY FIX FOR WELFARE & PRINCIPAL FLAGS ─────
-- Previous policies cast auth.uid()::text to compare with user_id.
-- staff_records.user_id is UUID — the ::text cast was unnecessary
-- and fragile. Replacing with direct UUID comparison.

-- principal_flags
DROP POLICY IF EXISTS "flags_principal_counsellor" ON public.principal_flags;
CREATE POLICY "flags_principal_counsellor" ON public.principal_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff_records
      WHERE  user_id   = auth.uid()                          -- UUID = UUID
        AND  sub_role IN ('principal', 'guidance_counselling')
        AND  school_id = principal_flags.school_id
    )
  );

-- welfare_logs — principal access
DROP POLICY IF EXISTS "principal_welfare_access" ON public.welfare_logs;
CREATE POLICY "principal_welfare_access" ON public.welfare_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_records
      WHERE  user_id   = auth.uid()
        AND  sub_role  = 'principal'
        AND  school_id = welfare_logs.school_id
    )
  );

-- welfare_logs — counsellor owns their records
DROP POLICY IF EXISTS "counsellor_own_records" ON public.welfare_logs;
CREATE POLICY "counsellor_own_records" ON public.welfare_logs
  FOR ALL USING (counsellor_id = auth.uid());               -- UUID = UUID

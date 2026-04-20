-- ============================================================
-- FIX REMAINING RLS GAPS — 2026-04-08
-- Closes the four specific gaps from the security audit.
-- All policies scope data by school_id = get_my_school_id().
-- ============================================================

-- ── 1. document_inbox — replace USING(true) ──────────────────
DROP POLICY IF EXISTS "service_role_all_document_inbox" ON public.document_inbox;
DROP POLICY IF EXISTS "document_inbox_select_own_school" ON public.document_inbox;

CREATE POLICY "document_inbox_select_own_school"
  ON public.document_inbox FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 2. apology_letters — replace USING(true) ─────────────────
DROP POLICY IF EXISTS "service_role_all_apology_letters" ON public.apology_letters;
DROP POLICY IF EXISTS "apology_letters_select_own_school" ON public.apology_letters;

-- Back-fill school_id from parent document_inbox row if missing
ALTER TABLE public.apology_letters ADD COLUMN IF NOT EXISTS school_id uuid;
UPDATE public.apology_letters al
SET    school_id = di.school_id
FROM   public.document_inbox di
WHERE  al.document_inbox_id = di.id
  AND  al.school_id IS NULL;

CREATE POLICY "apology_letters_select_own_school"
  ON public.apology_letters FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 3. department_codes — enable RLS ─────────────────────────
ALTER TABLE public.department_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dept_codes_select_own_school" ON public.department_codes;
CREATE POLICY "dept_codes_select_own_school"
  ON public.department_codes FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 4. appraisals — add school-scoped policies ────────────────
-- RLS was enabled but no policy existed → all browser access was silently denied.
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

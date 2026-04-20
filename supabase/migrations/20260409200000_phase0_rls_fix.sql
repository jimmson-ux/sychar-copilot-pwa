-- ============================================================
-- PHASE 0 RLS FIX — 2026-04-09
-- Closes 4 security gaps found in the audit.
-- Uses public.users (confirmed present, 32 rows) for school_id resolution.
-- All operations are idempotent (DROP IF EXISTS before CREATE).
-- Rules: ADDITIVE / FIX ONLY — no drops of data, no truncates.
-- ============================================================

-- ── 1. document_inbox: drop USING(true), add school-scoped ────
DROP POLICY IF EXISTS "service_role_all_document_inbox"      ON public.document_inbox;
DROP POLICY IF EXISTS "document_inbox_select_own_school"     ON public.document_inbox;

CREATE POLICY "document_inbox_select_own_school"
  ON public.document_inbox FOR ALL TO authenticated
  USING  (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text))
  WITH CHECK (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text));

-- ── 2. apology_letters: drop USING(true), add school-scoped ───
DROP POLICY IF EXISTS "service_role_all_apology_letters"     ON public.apology_letters;
DROP POLICY IF EXISTS "apology_letters_select_own_school"    ON public.apology_letters;

-- Add school_id if missing; existing rows left as NULL (invisible until backfilled)
ALTER TABLE public.apology_letters ADD COLUMN IF NOT EXISTS school_id uuid;

CREATE POLICY "apology_letters_select_own_school"
  ON public.apology_letters FOR ALL TO authenticated
  USING  (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text))
  WITH CHECK (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text));

-- ── 3. department_codes: RLS never enabled ────────────────────
ALTER TABLE public.department_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dept_codes_select_own_school"         ON public.department_codes;
CREATE POLICY "dept_codes_select_own_school"
  ON public.department_codes FOR ALL TO authenticated
  USING  (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text))
  WITH CHECK (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text));

-- ── 4. appraisals: RLS on but no policy (default-deny) ────────
ALTER TABLE public.appraisals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appraisals_select_own_school"         ON public.appraisals;
DROP POLICY IF EXISTS "appraisals_insert_own_school"         ON public.appraisals;
DROP POLICY IF EXISTS "appraisals_update_own_school"         ON public.appraisals;

CREATE POLICY "appraisals_school_isolation"
  ON public.appraisals FOR ALL TO authenticated
  USING  (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text))
  WITH CHECK (school_id = (SELECT school_id FROM public.users WHERE id = auth.uid()::text));

-- ── REMINDER (manual step) ────────────────────────────────────
-- Supabase Dashboard → Settings → API → uncheck "Enable API Schema"
-- (disable schema introspection so table names are not exposed)

-- ── VERIFICATION QUERIES ──────────────────────────────────────
-- SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--  WHERE tablename IN ('document_inbox','apology_letters','department_codes','appraisals')
--  ORDER BY tablename, policyname;

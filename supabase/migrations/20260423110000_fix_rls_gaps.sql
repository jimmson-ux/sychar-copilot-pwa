-- Supplement fix: ensure school-scoped policies exist on all four tables.
-- 20260408010000_fix_data_leak.sql handles these with get_my_school_id().
-- This file adds ANY-auth-method fallback policies under different names
-- so both paths work regardless of push order.

-- document_inbox — staff can insert their own school's docs
DROP POLICY IF EXISTS "document_inbox_school"          ON public.document_inbox;
DROP POLICY IF EXISTS "document_inbox_insert_own"      ON public.document_inbox;
CREATE POLICY "document_inbox_insert_own" ON public.document_inbox
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school_id());

-- apology_letters — school_id column added by 20260408010000
DROP POLICY IF EXISTS "apology_letters_school"         ON public.apology_letters;
DROP POLICY IF EXISTS "apology_letters_insert_own"     ON public.apology_letters;
CREATE POLICY "apology_letters_insert_own" ON public.apology_letters
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school_id());

-- department_codes — RLS + policy already handled by 20260408010000
-- Ensure the table has RLS enabled regardless of order
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'department_codes') THEN
    ALTER TABLE public.department_codes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- appraisals — already handled by 20260408010000; no new policy needed here

-- Verify: show all tables with their RLS status
SELECT
  t.tablename,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = 'public'
WHERE t.schemaname = 'public'
GROUP BY t.tablename, c.relrowsecurity
ORDER BY rls_enabled, t.tablename;

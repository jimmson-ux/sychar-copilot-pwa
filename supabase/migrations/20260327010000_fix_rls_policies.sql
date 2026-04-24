-- 1. Safely drop the open policies only if the tables exist
DO $$ 
BEGIN 
    -- Check Students
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'students' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_students" ON public.students;
    END IF;
    -- Check Marks
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'marks' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_marks" ON public.marks;
    END IF;
    -- Check Fee Records
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'fee_records' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_fee_records" ON public.fee_records;
    END IF;
    -- Check Fee Structure Items (The specific crash point)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'fee_structure_items' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_fee_structure" ON public.fee_structure_items;
    END IF;
    -- Check remaining tables
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'discipline' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_discipline" ON public.discipline;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'dept_reports' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_dept_reports" ON public.dept_reports;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ocr_log' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_ocr_log" ON public.ocr_log;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'staff_records' AND schemaname = 'public') THEN
        DROP POLICY IF EXISTS "service_all_staff" ON public.staff_records;
    END IF;
END $$;
-- ── 2. School-ID helper (SECURITY DEFINER avoids RLS recursion) ──────────────
--
-- When a policy on e.g. "students" calls get_my_school_id(), that function
-- must itself read "staff_records". Using SECURITY DEFINER lets it bypass
-- the RLS policies on staff_records for that single lookup, preventing the
-- infinite-recursion / empty-result problem.

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
$$;

-- ── 3. students ───────────────────────────────────────────────────────────────
--
-- Authenticated staff can SELECT students in their own school only.
-- This supports the live student-search box in the fee-receipt scanner.
--
-- INSERT / UPDATE / DELETE: no policy → denied for anon + authenticated.
-- service_role (used by all Next.js API routes) bypasses RLS entirely.

CREATE POLICY "staff_select_own_school_students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── 4. staff_records ─────────────────────────────────────────────────────────
--
-- Authenticated users can read all staff in their school (needed for role
-- checks, duty-appraisal teacher dropdowns, etc.).
-- The "OR user_id = auth.uid()" clause is a belt-and-suspenders fallback so
-- a user can always read their own row even before get_my_school_id() resolves.

CREATE POLICY "staff_select_own_school_staff"
  ON public.staff_records
  FOR SELECT
  TO authenticated
  USING (
    school_id = public.get_my_school_id()
    OR user_id  = auth.uid()::text
  );

-- ── 5. marks ─────────────────────────────────────────────────────────────────
-- All access via service_role API routes. No browser policy needed.
-- RLS enabled + no policy = default DENY for anon and authenticated roles.

-- ── 6. fee_records ───────────────────────────────────────────────────────────
-- All access via service_role API routes. Default DENY for browsers.

-- ── 7. fee_structure_items ───────────────────────────────────────────────────
-- All access via service_role API routes. Default DENY for browsers.

-- ── 8. discipline_records ────────────────────────────────────────────────────
-- All access via service_role API routes. Default DENY for browsers.

-- ── 9. department_reports ────────────────────────────────────────────────────
-- All access via service_role API routes. Default DENY for browsers.

-- ── 10. ocr_log ──────────────────────────────────────────────────────────────
-- Write-only from service_role. Browsers never need to read this. Default DENY.

-- ── NOTE ─────────────────────────────────────────────────────────────────────
-- The "appraisals" table (used by DutyGradingDashboard) is not covered by this
-- migration. It currently has a direct browser INSERT from DutyGradingDashboard.tsx.
-- That table needs its own school-scoped RLS policy and the write should be moved
-- to an API route (CRIT-7). Tracked as a follow-up.

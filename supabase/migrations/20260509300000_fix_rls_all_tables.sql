-- ================================================================
-- COMPREHENSIVE RLS FIX — 2026-05-09
--
-- Problem: 002_rls_policies.sql policies query public.users for
-- school_id and role. Google OAuth users have NO row in public.users
-- (their data lives in staff_records only). Every old policy returns
-- false → all dashboard data is invisible.
--
-- Fix:
--  1. Add get_my_role() and is_admin_role() helper functions.
--  2. For each table: drop broken public.users-based policies,
--     create school-scoped policies using get_my_school_id().
--  3. Some tables (fee_balances) lack school_id in the live DB —
--     add it and populate from students before creating the policy.
--  4. All statements are wrapped in DO blocks so a missing table
--     or column never aborts the whole migration.
-- ================================================================


-- ── Helper: current user's effective role from staff_records ───────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE v_role TEXT; BEGIN
  SELECT COALESCE(sub_role, role) INTO v_role
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
  RETURN v_role;
END; $$;

-- ── Helper: true for principal / deputy / super_admin ──────────────
CREATE OR REPLACE FUNCTION public.is_admin_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE v_role TEXT; BEGIN
  SELECT COALESCE(sub_role, role) INTO v_role
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
  RETURN COALESCE(v_role IN (
    'principal','deputy_principal',
    'deputy_principal_academics','deputy_principal_discipline',
    'dean_of_studies','super_admin'
  ), false);
END; $$;

-- ── Macro: safely create school-scoped policies on any table ──────
-- Usage: call the named sections below; each is wrapped in a DO block
-- that checks table + school_id column existence before proceeding.


-- ====================================================================
-- staff_records — add missing write policies
-- SELECT already fixed in 20260509000000_fix_rls_infinite_recursion
-- ====================================================================

DROP POLICY IF EXISTS "staff_records_insert_admin" ON public.staff_records;
DROP POLICY IF EXISTS "staff_records_update_admin" ON public.staff_records;
DROP POLICY IF EXISTS "staff_records_update_own"   ON public.staff_records;
DROP POLICY IF EXISTS "staff_records_delete_admin" ON public.staff_records;

CREATE POLICY "staff_records_insert_admin"
  ON public.staff_records FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());

CREATE POLICY "staff_records_update_admin"
  ON public.staff_records FOR UPDATE TO authenticated
  USING    (school_id = get_my_school_id() AND is_admin_role())
  WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "staff_records_update_own"
  ON public.staff_records FOR UPDATE TO authenticated
  USING     (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "staff_records_delete_admin"
  ON public.staff_records FOR DELETE TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());


-- ====================================================================
-- schools
-- ====================================================================

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schools_super_admin_all"          ON public.schools;
DROP POLICY IF EXISTS "schools_authenticated_select_own" ON public.schools;
DROP POLICY IF EXISTS "schools_school_select"            ON public.schools;
CREATE POLICY "schools_school_select"
  ON public.schools FOR SELECT TO authenticated
  USING (id = get_my_school_id());


-- ====================================================================
-- students
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='students') THEN
    RAISE NOTICE 'students table not found, skipping'; RETURN;
  END IF;

  ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "students_super_admin_all"      ON public.students;
  DROP POLICY IF EXISTS "students_staff_select"         ON public.students;
  DROP POLICY IF EXISTS "students_staff_insert"         ON public.students;
  DROP POLICY IF EXISTS "students_staff_update"         ON public.students;
  DROP POLICY IF EXISTS "students_parent_select_linked" ON public.students;
  DROP POLICY IF EXISTS "students_school_select"        ON public.students;
  DROP POLICY IF EXISTS "students_school_insert"        ON public.students;
  DROP POLICY IF EXISTS "students_school_update"        ON public.students;
  DROP POLICY IF EXISTS "students_school_delete"        ON public.students;

  CREATE POLICY "students_school_select"
    ON public.students FOR SELECT TO authenticated
    USING (school_id = get_my_school_id());

  CREATE POLICY "students_school_insert"
    ON public.students FOR INSERT TO authenticated
    WITH CHECK (school_id = get_my_school_id());

  CREATE POLICY "students_school_update"
    ON public.students FOR UPDATE TO authenticated
    USING    (school_id = get_my_school_id())
    WITH CHECK (school_id = get_my_school_id());

  CREATE POLICY "students_school_delete"
    ON public.students FOR DELETE TO authenticated
    USING (school_id = get_my_school_id() AND is_admin_role());
END $$;


-- ====================================================================
-- fee_balances  — live DB may lack school_id; add it if missing
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='fee_balances') THEN
    RAISE NOTICE 'fee_balances not found, skipping'; RETURN;
  END IF;

  -- Add school_id column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fee_balances' AND column_name='school_id'
  ) THEN
    ALTER TABLE public.fee_balances ADD COLUMN school_id UUID;
    -- Populate from students.school_id
    UPDATE public.fee_balances fb
    SET    school_id = s.school_id
    FROM   public.students s
    WHERE  s.id = fb.student_id AND fb.school_id IS NULL;
    RAISE NOTICE 'fee_balances.school_id added and populated';
  END IF;

  -- Add total_fees alias column for dashboard compatibility
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fee_balances' AND column_name='total_fees'
  ) THEN
    -- Use whichever billing column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fee_balances' AND column_name='total_billed'
    ) THEN
      ALTER TABLE public.fee_balances ADD COLUMN total_fees NUMERIC(12,2)
        GENERATED ALWAYS AS (total_billed) STORED;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fee_balances' AND column_name='invoiced_amount'
    ) THEN
      ALTER TABLE public.fee_balances ADD COLUMN total_fees NUMERIC(12,2)
        GENERATED ALWAYS AS (invoiced_amount) STORED;
    END IF;
  END IF;

  -- Add amount_paid alias column for dashboard compatibility
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fee_balances' AND column_name='amount_paid'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fee_balances' AND column_name='total_paid'
    ) THEN
      ALTER TABLE public.fee_balances ADD COLUMN amount_paid NUMERIC(12,2)
        GENERATED ALWAYS AS (total_paid) STORED;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fee_balances' AND column_name='paid_amount'
    ) THEN
      ALTER TABLE public.fee_balances ADD COLUMN amount_paid NUMERIC(12,2)
        GENERATED ALWAYS AS (paid_amount) STORED;
    END IF;
  END IF;

  ALTER TABLE public.fee_balances ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "fee_balances_super_admin_all"         ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_principal_bursar_select" ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_principal_bursar_insert" ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_principal_bursar_update" ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_principal_bursar_delete" ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_other_staff_select"      ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_parent_select_linked"    ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_school_select"           ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_school_update"           ON public.fee_balances;
  DROP POLICY IF EXISTS "fee_balances_school_delete"           ON public.fee_balances;

  CREATE POLICY "fee_balances_school_select"
    ON public.fee_balances FOR SELECT TO authenticated
    USING (school_id = get_my_school_id());

  CREATE POLICY "fee_balances_school_insert"
    ON public.fee_balances FOR INSERT TO authenticated
    WITH CHECK (school_id = get_my_school_id());

  CREATE POLICY "fee_balances_school_update"
    ON public.fee_balances FOR UPDATE TO authenticated
    USING    (school_id = get_my_school_id())
    WITH CHECK (school_id = get_my_school_id());

  CREATE POLICY "fee_balances_school_delete"
    ON public.fee_balances FOR DELETE TO authenticated
    USING (school_id = get_my_school_id() AND is_admin_role());
END $$;


-- ====================================================================
-- fee_transactions
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='fee_transactions') THEN
    RAISE NOTICE 'fee_transactions not found, skipping'; RETURN;
  END IF;

  -- Add school_id if missing (link via student_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fee_transactions' AND column_name='school_id'
  ) THEN
    ALTER TABLE public.fee_transactions ADD COLUMN school_id UUID;
    UPDATE public.fee_transactions ft SET school_id = s.school_id
    FROM public.students s WHERE s.id = ft.student_id AND ft.school_id IS NULL;
  END IF;

  ALTER TABLE public.fee_transactions ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "fee_transactions_super_admin_all"         ON public.fee_transactions;
  DROP POLICY IF EXISTS "fee_transactions_principal_bursar_insert" ON public.fee_transactions;
  DROP POLICY IF EXISTS "fee_transactions_principal_bursar_select" ON public.fee_transactions;
  DROP POLICY IF EXISTS "fee_transactions_parent_select_linked"    ON public.fee_transactions;
  DROP POLICY IF EXISTS "fee_transactions_school_select"           ON public.fee_transactions;
  DROP POLICY IF EXISTS "fee_transactions_school_insert"           ON public.fee_transactions;

  CREATE POLICY "fee_transactions_school_select"
    ON public.fee_transactions FOR SELECT TO authenticated
    USING (school_id = get_my_school_id());

  CREATE POLICY "fee_transactions_school_insert"
    ON public.fee_transactions FOR INSERT TO authenticated
    WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- marks  (dashboard queries this table by name 'marks')
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='marks') THEN
    RAISE NOTICE 'marks table not found, skipping'; RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='marks' AND column_name='school_id'
  ) THEN
    RAISE NOTICE 'marks.school_id not found, skipping'; RETURN;
  END IF;

  ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "marks_school_select" ON public.marks;
  DROP POLICY IF EXISTS "marks_school_insert" ON public.marks;
  DROP POLICY IF EXISTS "marks_school_update" ON public.marks;
  DROP POLICY IF EXISTS "marks_school_delete" ON public.marks;

  CREATE POLICY "marks_school_select"
    ON public.marks FOR SELECT TO authenticated
    USING (school_id = get_my_school_id());
  CREATE POLICY "marks_school_insert"
    ON public.marks FOR INSERT TO authenticated
    WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "marks_school_update"
    ON public.marks FOR UPDATE TO authenticated
    USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "marks_school_delete"
    ON public.marks FOR DELETE TO authenticated
    USING (school_id = get_my_school_id() AND is_admin_role());
END $$;


-- student_marks (alternate name)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='student_marks') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_marks' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.student_marks ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "student_marks_school_select" ON public.student_marks;
  DROP POLICY IF EXISTS "student_marks_school_insert" ON public.student_marks;
  DROP POLICY IF EXISTS "student_marks_school_update" ON public.student_marks;
  CREATE POLICY "student_marks_school_select" ON public.student_marks FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "student_marks_school_insert" ON public.student_marks FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "student_marks_school_update" ON public.student_marks FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- notices
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='notices') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notices' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "notices_school_select" ON public.notices;
  DROP POLICY IF EXISTS "notices_school_insert" ON public.notices;
  DROP POLICY IF EXISTS "notices_school_update" ON public.notices;
  DROP POLICY IF EXISTS "notices_school_delete" ON public.notices;
  CREATE POLICY "notices_school_select" ON public.notices FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "notices_school_insert" ON public.notices FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "notices_school_update" ON public.notices FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "notices_school_delete" ON public.notices FOR DELETE TO authenticated USING (school_id = get_my_school_id() AND is_admin_role());
END $$;


-- ====================================================================
-- discipline_records
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='discipline_records') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='discipline_records' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.discipline_records ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "discipline_records_school_select" ON public.discipline_records;
  DROP POLICY IF EXISTS "discipline_records_school_insert" ON public.discipline_records;
  DROP POLICY IF EXISTS "discipline_records_school_update" ON public.discipline_records;
  DROP POLICY IF EXISTS "discipline_records_school_delete" ON public.discipline_records;
  CREATE POLICY "discipline_records_school_select" ON public.discipline_records FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "discipline_records_school_insert" ON public.discipline_records FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "discipline_records_school_update" ON public.discipline_records FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "discipline_records_school_delete" ON public.discipline_records FOR DELETE TO authenticated USING (school_id = get_my_school_id() AND is_admin_role());
END $$;


-- ====================================================================
-- bursaries
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='bursaries') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bursaries' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.bursaries ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "bursaries_super_admin_all"         ON public.bursaries;
  DROP POLICY IF EXISTS "bursaries_principal_bursar_insert" ON public.bursaries;
  DROP POLICY IF EXISTS "bursaries_principal_bursar_select" ON public.bursaries;
  DROP POLICY IF EXISTS "bursaries_school_select"           ON public.bursaries;
  DROP POLICY IF EXISTS "bursaries_school_insert"           ON public.bursaries;
  CREATE POLICY "bursaries_school_select" ON public.bursaries FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "bursaries_school_insert" ON public.bursaries FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- vote_heads
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='vote_heads') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vote_heads' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.vote_heads ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "vote_heads_super_admin_all"      ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_principal_select"     ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_principal_insert"     ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_principal_update"     ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_principal_delete"     ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_bursar_deputy_select" ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_school_select"        ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_school_update"        ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_school_delete"        ON public.vote_heads;
  CREATE POLICY "vote_heads_school_select" ON public.vote_heads FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "vote_heads_school_insert" ON public.vote_heads FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id() AND is_admin_role());
  CREATE POLICY "vote_heads_school_update" ON public.vote_heads FOR UPDATE TO authenticated USING (school_id = get_my_school_id() AND is_admin_role()) WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "vote_heads_school_delete" ON public.vote_heads FOR DELETE TO authenticated USING (school_id = get_my_school_id() AND is_admin_role());
END $$;


-- ====================================================================
-- lpos
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='lpos') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lpos' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.lpos ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "lpos_super_admin_all"      ON public.lpos;
  DROP POLICY IF EXISTS "lpos_principal_select"     ON public.lpos;
  DROP POLICY IF EXISTS "lpos_principal_insert"     ON public.lpos;
  DROP POLICY IF EXISTS "lpos_principal_update"     ON public.lpos;
  DROP POLICY IF EXISTS "lpos_principal_delete"     ON public.lpos;
  DROP POLICY IF EXISTS "lpos_bursar_deputy_select" ON public.lpos;
  DROP POLICY IF EXISTS "lpos_school_select"        ON public.lpos;
  DROP POLICY IF EXISTS "lpos_school_insert"        ON public.lpos;
  DROP POLICY IF EXISTS "lpos_school_update"        ON public.lpos;
  DROP POLICY IF EXISTS "lpos_school_delete"        ON public.lpos;
  CREATE POLICY "lpos_school_select" ON public.lpos FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "lpos_school_insert" ON public.lpos FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "lpos_school_update" ON public.lpos FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "lpos_school_delete" ON public.lpos FOR DELETE TO authenticated USING (school_id = get_my_school_id() AND is_admin_role());
END $$;


-- ====================================================================
-- grns
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='grns') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='grns' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "grns_super_admin_all"                ON public.grns;
  DROP POLICY IF EXISTS "grns_storekeeper_insert"             ON public.grns;
  DROP POLICY IF EXISTS "grns_storekeeper_select"             ON public.grns;
  DROP POLICY IF EXISTS "grns_principal_bursar_deputy_select" ON public.grns;
  DROP POLICY IF EXISTS "grns_school_select"                  ON public.grns;
  DROP POLICY IF EXISTS "grns_school_insert"                  ON public.grns;
  CREATE POLICY "grns_school_select" ON public.grns FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "grns_school_insert" ON public.grns FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- payments
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='payments') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "payments_super_admin_all"   ON public.payments;
  DROP POLICY IF EXISTS "payments_bursar_insert"     ON public.payments;
  DROP POLICY IF EXISTS "payments_bursar_select"     ON public.payments;
  DROP POLICY IF EXISTS "payments_principal_select"  ON public.payments;
  DROP POLICY IF EXISTS "payments_bom_member_select" ON public.payments;
  DROP POLICY IF EXISTS "payments_school_select"     ON public.payments;
  DROP POLICY IF EXISTS "payments_school_insert"     ON public.payments;
  CREATE POLICY "payments_school_select" ON public.payments FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "payments_school_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- imprest_advances
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='imprest_advances') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='imprest_advances' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.imprest_advances ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "imprest_super_admin_all"  ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_principal_select" ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_principal_insert" ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_principal_update" ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_principal_delete" ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_bursar_select"    ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_bursar_update"    ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_school_select"    ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_school_insert"    ON public.imprest_advances;
  DROP POLICY IF EXISTS "imprest_school_update"    ON public.imprest_advances;
  CREATE POLICY "imprest_school_select" ON public.imprest_advances FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "imprest_school_insert" ON public.imprest_advances FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "imprest_school_update" ON public.imprest_advances FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- employees
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='employees') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "employees_super_admin_all"         ON public.employees;
  DROP POLICY IF EXISTS "employees_principal_bursar_select" ON public.employees;
  DROP POLICY IF EXISTS "employees_principal_bursar_insert" ON public.employees;
  DROP POLICY IF EXISTS "employees_principal_bursar_update" ON public.employees;
  DROP POLICY IF EXISTS "employees_principal_bursar_delete" ON public.employees;
  DROP POLICY IF EXISTS "employees_other_staff_select"      ON public.employees;
  DROP POLICY IF EXISTS "employees_school_select"           ON public.employees;
  DROP POLICY IF EXISTS "employees_school_insert"           ON public.employees;
  DROP POLICY IF EXISTS "employees_school_update"           ON public.employees;
  CREATE POLICY "employees_school_select" ON public.employees FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "employees_school_insert" ON public.employees FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "employees_school_update" ON public.employees FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- payroll
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='payroll') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payroll' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "payroll_super_admin_all"     ON public.payroll;
  DROP POLICY IF EXISTS "payroll_bursar_select"       ON public.payroll;
  DROP POLICY IF EXISTS "payroll_bursar_insert"       ON public.payroll;
  DROP POLICY IF EXISTS "payroll_bursar_update"       ON public.payroll;
  DROP POLICY IF EXISTS "payroll_bursar_delete"       ON public.payroll;
  DROP POLICY IF EXISTS "payroll_principal_select"    ON public.payroll;
  DROP POLICY IF EXISTS "payroll_principal_update"    ON public.payroll;
  DROP POLICY IF EXISTS "payroll_employee_select_own" ON public.payroll;
  DROP POLICY IF EXISTS "payroll_school_select"       ON public.payroll;
  DROP POLICY IF EXISTS "payroll_school_insert"       ON public.payroll;
  DROP POLICY IF EXISTS "payroll_school_update"       ON public.payroll;
  CREATE POLICY "payroll_school_select" ON public.payroll FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "payroll_school_insert" ON public.payroll FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "payroll_school_update" ON public.payroll FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- gate_passes / visitor_log / staff_attendance
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='gate_passes') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gate_passes' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "gate_passes_super_admin_all"         ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_principal_deputy_select" ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_principal_deputy_insert" ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_principal_deputy_update" ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_principal_deputy_delete" ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_watchman_insert"         ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_watchman_select"         ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_parent_select_linked"    ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_school_select"           ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_school_insert"           ON public.gate_passes;
  DROP POLICY IF EXISTS "gate_passes_school_update"           ON public.gate_passes;
  CREATE POLICY "gate_passes_school_select" ON public.gate_passes FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "gate_passes_school_insert" ON public.gate_passes FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "gate_passes_school_update" ON public.gate_passes FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='visitor_log') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='visitor_log' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.visitor_log ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "visitor_log_super_admin_all"                  ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_select" ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_insert" ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_update" ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_delete" ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_bursar_storekeeper_select"        ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_school_select"                    ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_school_insert"                    ON public.visitor_log;
  DROP POLICY IF EXISTS "visitor_log_school_update"                    ON public.visitor_log;
  CREATE POLICY "visitor_log_school_select" ON public.visitor_log FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "visitor_log_school_insert" ON public.visitor_log FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "visitor_log_school_update" ON public.visitor_log FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='staff_attendance') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_attendance' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "staff_attendance_super_admin_all"         ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_principal_deputy_select" ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_principal_deputy_insert" ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_principal_deputy_update" ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_principal_deputy_delete" ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_bursar_select"           ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_employee_select_own"     ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_school_select"           ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_school_insert"           ON public.staff_attendance;
  DROP POLICY IF EXISTS "staff_attendance_school_update"           ON public.staff_attendance;
  CREATE POLICY "staff_attendance_school_select" ON public.staff_attendance FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "staff_attendance_school_insert" ON public.staff_attendance FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "staff_attendance_school_update" ON public.staff_attendance FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- pocket money / bread vouchers
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pocket_money_ledger') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pocket_money_ledger' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.pocket_money_ledger ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "pml_super_admin_all"      ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_bursar_select"        ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_bursar_insert"        ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_bursar_update"        ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_bursar_delete"        ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_principal_select"     ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_parent_select_linked" ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_school_select"        ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_school_insert"        ON public.pocket_money_ledger;
  DROP POLICY IF EXISTS "pml_school_update"        ON public.pocket_money_ledger;
  CREATE POLICY "pml_school_select" ON public.pocket_money_ledger FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "pml_school_insert" ON public.pocket_money_ledger FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "pml_school_update" ON public.pocket_money_ledger FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pocket_money_balances') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pocket_money_balances' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.pocket_money_balances ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "pmb_super_admin_all"      ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_bursar_select"        ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_bursar_insert"        ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_bursar_update"        ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_bursar_delete"        ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_principal_select"     ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_parent_select_linked" ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_school_select"        ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_school_insert"        ON public.pocket_money_balances;
  DROP POLICY IF EXISTS "pmb_school_update"        ON public.pocket_money_balances;
  CREATE POLICY "pmb_school_select" ON public.pocket_money_balances FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "pmb_school_insert" ON public.pocket_money_balances FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "pmb_school_update" ON public.pocket_money_balances FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='bread_vouchers') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bread_vouchers' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.bread_vouchers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "bread_vouchers_super_admin_all"      ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_bursar_select"        ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_bursar_insert"        ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_bursar_update"        ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_bursar_delete"        ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_principal_select"     ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_watchman_update"      ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_parent_select_linked" ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_school_select"        ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_school_insert"        ON public.bread_vouchers;
  DROP POLICY IF EXISTS "bread_vouchers_school_update"        ON public.bread_vouchers;
  CREATE POLICY "bread_vouchers_school_select" ON public.bread_vouchers FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "bread_vouchers_school_insert" ON public.bread_vouchers FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "bread_vouchers_school_update" ON public.bread_vouchers FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- Newer phase tables — all wrapped in table + column existence check
-- ====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='classes') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='classes' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "classes_school_select" ON public.classes; DROP POLICY IF EXISTS "classes_school_insert" ON public.classes;
  CREATE POLICY "classes_school_select" ON public.classes FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "classes_school_insert" ON public.classes FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='lesson_plans') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lesson_plans' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "lesson_plans_school_select" ON public.lesson_plans; DROP POLICY IF EXISTS "lesson_plans_school_insert" ON public.lesson_plans; DROP POLICY IF EXISTS "lesson_plans_school_update" ON public.lesson_plans;
  CREATE POLICY "lesson_plans_school_select" ON public.lesson_plans FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "lesson_plans_school_insert" ON public.lesson_plans FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "lesson_plans_school_update" ON public.lesson_plans FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='appraisals') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appraisals' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.appraisals ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "appraisals_school_select" ON public.appraisals; DROP POLICY IF EXISTS "appraisals_school_insert" ON public.appraisals; DROP POLICY IF EXISTS "appraisals_school_update" ON public.appraisals;
  CREATE POLICY "appraisals_school_select" ON public.appraisals FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "appraisals_school_insert" ON public.appraisals FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "appraisals_school_update" ON public.appraisals FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='duty_appraisals') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='duty_appraisals' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.duty_appraisals ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "duty_appraisals_school_select" ON public.duty_appraisals; DROP POLICY IF EXISTS "duty_appraisals_school_insert" ON public.duty_appraisals; DROP POLICY IF EXISTS "duty_appraisals_school_update" ON public.duty_appraisals;
  CREATE POLICY "duty_appraisals_school_select" ON public.duty_appraisals FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "duty_appraisals_school_insert" ON public.duty_appraisals FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "duty_appraisals_school_update" ON public.duty_appraisals FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='timetable') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='timetable' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "timetable_school_select" ON public.timetable; DROP POLICY IF EXISTS "timetable_school_insert" ON public.timetable; DROP POLICY IF EXISTS "timetable_school_update" ON public.timetable;
  CREATE POLICY "timetable_school_select" ON public.timetable FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "timetable_school_insert" ON public.timetable FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "timetable_school_update" ON public.timetable FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ai_insights') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_insights' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "ai_insights_school_select" ON public.ai_insights; DROP POLICY IF EXISTS "ai_insights_school_insert" ON public.ai_insights;
  CREATE POLICY "ai_insights_school_select" ON public.ai_insights FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "ai_insights_school_insert" ON public.ai_insights FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='seating_plans') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='seating_plans' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.seating_plans ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "seating_plans_school_select" ON public.seating_plans; DROP POLICY IF EXISTS "seating_plans_school_insert" ON public.seating_plans; DROP POLICY IF EXISTS "seating_plans_school_update" ON public.seating_plans;
  CREATE POLICY "seating_plans_school_select" ON public.seating_plans FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "seating_plans_school_insert" ON public.seating_plans FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "seating_plans_school_update" ON public.seating_plans FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='suspensions') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='suspensions' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "suspensions_school_select" ON public.suspensions; DROP POLICY IF EXISTS "suspensions_school_insert" ON public.suspensions; DROP POLICY IF EXISTS "suspensions_school_update" ON public.suspensions;
  CREATE POLICY "suspensions_school_select" ON public.suspensions FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "suspensions_school_insert" ON public.suspensions FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "suspensions_school_update" ON public.suspensions FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='gc_diary') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gc_diary' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.gc_diary ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "gc_diary_school_select" ON public.gc_diary; DROP POLICY IF EXISTS "gc_diary_school_insert" ON public.gc_diary; DROP POLICY IF EXISTS "gc_diary_school_update" ON public.gc_diary;
  CREATE POLICY "gc_diary_school_select" ON public.gc_diary FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "gc_diary_school_insert" ON public.gc_diary FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "gc_diary_school_update" ON public.gc_diary FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='parent_contexts') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_contexts' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.parent_contexts ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "parent_contexts_school_select" ON public.parent_contexts; DROP POLICY IF EXISTS "parent_contexts_school_insert" ON public.parent_contexts;
  CREATE POLICY "parent_contexts_school_select" ON public.parent_contexts FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "parent_contexts_school_insert" ON public.parent_contexts FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='wallet_accounts') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wallet_accounts' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "wallet_accounts_school_select" ON public.wallet_accounts; DROP POLICY IF EXISTS "wallet_accounts_school_insert" ON public.wallet_accounts; DROP POLICY IF EXISTS "wallet_accounts_school_update" ON public.wallet_accounts;
  CREATE POLICY "wallet_accounts_school_select" ON public.wallet_accounts FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "wallet_accounts_school_insert" ON public.wallet_accounts FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "wallet_accounts_school_update" ON public.wallet_accounts FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='procurement_requests') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='procurement_requests' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.procurement_requests ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "procurement_requests_school_select" ON public.procurement_requests; DROP POLICY IF EXISTS "procurement_requests_school_insert" ON public.procurement_requests; DROP POLICY IF EXISTS "procurement_requests_school_update" ON public.procurement_requests;
  CREATE POLICY "procurement_requests_school_select" ON public.procurement_requests FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "procurement_requests_school_insert" ON public.procurement_requests FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "procurement_requests_school_update" ON public.procurement_requests FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='teacher_subjects') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teacher_subjects' AND column_name='school_id') THEN RETURN; END IF;
  ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "teacher_subjects_school_select" ON public.teacher_subjects; DROP POLICY IF EXISTS "teacher_subjects_school_insert" ON public.teacher_subjects; DROP POLICY IF EXISTS "teacher_subjects_school_update" ON public.teacher_subjects;
  CREATE POLICY "teacher_subjects_school_select" ON public.teacher_subjects FOR SELECT TO authenticated USING (school_id = get_my_school_id());
  CREATE POLICY "teacher_subjects_school_insert" ON public.teacher_subjects FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
  CREATE POLICY "teacher_subjects_school_update" ON public.teacher_subjects FOR UPDATE TO authenticated USING (school_id = get_my_school_id()) WITH CHECK (school_id = get_my_school_id());
END $$;


-- ====================================================================
-- Verification
-- ====================================================================
DO $$
DECLARE cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt FROM pg_proc
  WHERE proname IN ('get_my_school_id','get_my_role','is_admin_role')
    AND pronamespace = 'public'::regnamespace;
  RAISE NOTICE 'Helper functions registered: % / 3', cnt;

  SELECT COUNT(*) INTO cnt
  FROM pg_policies
  WHERE schemaname = 'public' AND policyname LIKE '%_school_%';
  RAISE NOTICE 'School-scoped policies created: %', cnt;
END $$;

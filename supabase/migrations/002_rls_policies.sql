-- ============================================================
-- SYCHAR COPILOT — MIGRATION 002: ROW LEVEL SECURITY POLICIES
-- ============================================================
--
-- SECTIONS:
--   01. schools
--   02. users
--   03. students
--   04. parents
--   05. attendance          (student attendance)
--   06. fee_balances
--   07. fee_transactions
--   08. bursaries
--   09. vote_heads
--   10. lpos
--   11. grns
--   12. payments
--   13. imprest_advances
--   14. employees
--   15. payroll
--   16. gate_passes         (add-on)
--   17. visitor_log         (add-on)
--   18. staff_attendance    (add-on)
--   19. pocket_money_ledger (add-on)
--   20. pocket_money_balances (add-on)
--   21. bread_vouchers      (add-on)
--   22. system_logs
--   23. global_settings
--   24. user_subscriptions
--
-- Helper expressions used in USING / WITH CHECK clauses:
--   school  → (SELECT school_id    FROM public.users WHERE id = auth.uid())
--   admin   → (SELECT is_super_admin FROM public.users WHERE id = auth.uid())
--   role    → (SELECT role::TEXT    FROM public.users WHERE id = auth.uid())
--
-- NOTE: Add-on tables always have RLS enforced. Feature flags
-- in schools.features control UI visibility only.
--
-- Safe to re-run: every CREATE POLICY is preceded by
-- DROP POLICY IF EXISTS with the same name.
-- ============================================================


-- ============================================================
-- 01. schools
-- ============================================================

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted access to all school rows
DROP POLICY IF EXISTS "schools_super_admin_all" ON public.schools;
CREATE POLICY "schools_super_admin_all"
  ON public.schools
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Authenticated staff / parents: read their own school row only
DROP POLICY IF EXISTS "schools_authenticated_select_own" ON public.schools;
CREATE POLICY "schools_authenticated_select_own"
  ON public.schools
  FOR SELECT
  TO authenticated
  USING (id = (SELECT school_id FROM public.users WHERE id = auth.uid()));


-- ============================================================
-- 02. users
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted access to all user rows
DROP POLICY IF EXISTS "users_super_admin_all" ON public.users;
CREATE POLICY "users_super_admin_all"
  ON public.users
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Any authenticated user: read their own row
DROP POLICY IF EXISTS "users_select_own_row" ON public.users;
CREATE POLICY "users_select_own_row"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Any authenticated user: update their own row only
DROP POLICY IF EXISTS "users_update_own_row" ON public.users;
CREATE POLICY "users_update_own_row"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING     (id = auth.uid())
  WITH CHECK(id = auth.uid());

-- Principal, bursar, deputy: read all users in their school
DROP POLICY IF EXISTS "users_staff_select_same_school" ON public.users;
CREATE POLICY "users_staff_select_same_school"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy')
  );


-- ============================================================
-- 03. students
-- ============================================================

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "students_super_admin_all" ON public.students;
CREATE POLICY "students_super_admin_all"
  ON public.students
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- School staff (principal, bursar, deputy, storekeeper, watchman): SELECT
DROP POLICY IF EXISTS "students_staff_select" ON public.students;
CREATE POLICY "students_staff_select"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- School staff: INSERT
DROP POLICY IF EXISTS "students_staff_insert" ON public.students;
CREATE POLICY "students_staff_insert"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- School staff: UPDATE
DROP POLICY IF EXISTS "students_staff_update" ON public.students;
CREATE POLICY "students_staff_update"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- Parents: SELECT only their own linked students via student_parents
DROP POLICY IF EXISTS "students_parent_select_linked" ON public.students;
CREATE POLICY "students_parent_select_linked"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = students.id
    )
  );


-- ============================================================
-- 04. parents
-- ============================================================

ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "parents_super_admin_all" ON public.parents;
CREATE POLICY "parents_super_admin_all"
  ON public.parents
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- School staff: SELECT parents in their school
-- (parents are linked to students who belong to a school)
DROP POLICY IF EXISTS "parents_staff_select" ON public.parents;
CREATE POLICY "parents_staff_select"
  ON public.parents
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      JOIN   public.students        s  ON s.id = sp.student_id
      WHERE  sp.parent_id = parents.id
      AND    s.school_id  = (SELECT school_id FROM public.users WHERE id = auth.uid())
    )
  );

-- School staff: INSERT new parent rows
DROP POLICY IF EXISTS "parents_staff_insert" ON public.parents;
CREATE POLICY "parents_staff_insert"
  ON public.parents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- Parent: SELECT their own row
DROP POLICY IF EXISTS "parents_select_own_row" ON public.parents;
CREATE POLICY "parents_select_own_row"
  ON public.parents
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Parent: UPDATE their own row only
DROP POLICY IF EXISTS "parents_update_own_row" ON public.parents;
CREATE POLICY "parents_update_own_row"
  ON public.parents
  FOR UPDATE
  TO authenticated
  USING     (id = auth.uid())
  WITH CHECK(id = auth.uid());


-- ============================================================
-- 05. attendance  (student attendance — core feature)
-- ============================================================

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "attendance_super_admin_all" ON public.attendance;
CREATE POLICY "attendance_super_admin_all"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- School staff: SELECT
DROP POLICY IF EXISTS "attendance_staff_select" ON public.attendance;
CREATE POLICY "attendance_staff_select"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- School staff: INSERT
DROP POLICY IF EXISTS "attendance_staff_insert" ON public.attendance;
CREATE POLICY "attendance_staff_insert"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- School staff: UPDATE
DROP POLICY IF EXISTS "attendance_staff_update" ON public.attendance;
CREATE POLICY "attendance_staff_update"
  ON public.attendance
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- School staff: DELETE
DROP POLICY IF EXISTS "attendance_staff_delete" ON public.attendance;
CREATE POLICY "attendance_staff_delete"
  ON public.attendance
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy', 'storekeeper', 'watchman')
  );

-- Parents: SELECT attendance for their linked students only
DROP POLICY IF EXISTS "attendance_parent_select_linked" ON public.attendance;
CREATE POLICY "attendance_parent_select_linked"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = attendance.student_id
    )
  );


-- ============================================================
-- 06. fee_balances
-- ============================================================

ALTER TABLE public.fee_balances ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "fee_balances_super_admin_all" ON public.fee_balances;
CREATE POLICY "fee_balances_super_admin_all"
  ON public.fee_balances
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal, bursar: full CRUD for their school
DROP POLICY IF EXISTS "fee_balances_principal_bursar_select" ON public.fee_balances;
CREATE POLICY "fee_balances_principal_bursar_select"
  ON public.fee_balances
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

DROP POLICY IF EXISTS "fee_balances_principal_bursar_insert" ON public.fee_balances;
CREATE POLICY "fee_balances_principal_bursar_insert"
  ON public.fee_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

DROP POLICY IF EXISTS "fee_balances_principal_bursar_update" ON public.fee_balances;
CREATE POLICY "fee_balances_principal_bursar_update"
  ON public.fee_balances
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

DROP POLICY IF EXISTS "fee_balances_principal_bursar_delete" ON public.fee_balances;
CREATE POLICY "fee_balances_principal_bursar_delete"
  ON public.fee_balances
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

-- Other staff: SELECT only
DROP POLICY IF EXISTS "fee_balances_other_staff_select" ON public.fee_balances;
CREATE POLICY "fee_balances_other_staff_select"
  ON public.fee_balances
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('deputy', 'storekeeper', 'watchman', 'bom_member')
  );

-- Parents: SELECT balance for their linked students only
DROP POLICY IF EXISTS "fee_balances_parent_select_linked" ON public.fee_balances;
CREATE POLICY "fee_balances_parent_select_linked"
  ON public.fee_balances
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = fee_balances.student_id
    )
  );


-- ============================================================
-- 07. fee_transactions
-- Immutable audit trail: no UPDATE or DELETE for any role
-- except super admin.
-- ============================================================

ALTER TABLE public.fee_transactions ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "fee_transactions_super_admin_all" ON public.fee_transactions;
CREATE POLICY "fee_transactions_super_admin_all"
  ON public.fee_transactions
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal, bursar: INSERT new transactions
DROP POLICY IF EXISTS "fee_transactions_principal_bursar_insert" ON public.fee_transactions;
CREATE POLICY "fee_transactions_principal_bursar_insert"
  ON public.fee_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

-- Principal, bursar: SELECT transactions in their school
DROP POLICY IF EXISTS "fee_transactions_principal_bursar_select" ON public.fee_transactions;
CREATE POLICY "fee_transactions_principal_bursar_select"
  ON public.fee_transactions
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

-- Parents: SELECT transactions for their linked students only
DROP POLICY IF EXISTS "fee_transactions_parent_select_linked" ON public.fee_transactions;
CREATE POLICY "fee_transactions_parent_select_linked"
  ON public.fee_transactions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = fee_transactions.student_id
    )
  );


-- ============================================================
-- 08. bursaries
-- No UPDATE or DELETE for bursar — bursaries are an audit
-- record once applied.
-- ============================================================

ALTER TABLE public.bursaries ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "bursaries_super_admin_all" ON public.bursaries;
CREATE POLICY "bursaries_super_admin_all"
  ON public.bursaries
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal, bursar: INSERT bursaries for their school
DROP POLICY IF EXISTS "bursaries_principal_bursar_insert" ON public.bursaries;
CREATE POLICY "bursaries_principal_bursar_insert"
  ON public.bursaries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

-- Principal, bursar: SELECT bursaries for their school
DROP POLICY IF EXISTS "bursaries_principal_bursar_select" ON public.bursaries;
CREATE POLICY "bursaries_principal_bursar_select"
  ON public.bursaries
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );


-- ============================================================
-- 09. vote_heads
-- ============================================================

ALTER TABLE public.vote_heads ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "vote_heads_super_admin_all" ON public.vote_heads;
CREATE POLICY "vote_heads_super_admin_all"
  ON public.vote_heads
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal: full CRUD for their school
DROP POLICY IF EXISTS "vote_heads_principal_select" ON public.vote_heads;
CREATE POLICY "vote_heads_principal_select"
  ON public.vote_heads
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "vote_heads_principal_insert" ON public.vote_heads;
CREATE POLICY "vote_heads_principal_insert"
  ON public.vote_heads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "vote_heads_principal_update" ON public.vote_heads;
CREATE POLICY "vote_heads_principal_update"
  ON public.vote_heads
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "vote_heads_principal_delete" ON public.vote_heads;
CREATE POLICY "vote_heads_principal_delete"
  ON public.vote_heads
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- Bursar, deputy: SELECT only
DROP POLICY IF EXISTS "vote_heads_bursar_deputy_select" ON public.vote_heads;
CREATE POLICY "vote_heads_bursar_deputy_select"
  ON public.vote_heads
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('bursar', 'deputy')
  );


-- ============================================================
-- 10. lpos
-- ============================================================

ALTER TABLE public.lpos ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "lpos_super_admin_all" ON public.lpos;
CREATE POLICY "lpos_super_admin_all"
  ON public.lpos
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal (AIE): full CRUD for their school
DROP POLICY IF EXISTS "lpos_principal_select" ON public.lpos;
CREATE POLICY "lpos_principal_select"
  ON public.lpos
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "lpos_principal_insert" ON public.lpos;
CREATE POLICY "lpos_principal_insert"
  ON public.lpos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "lpos_principal_update" ON public.lpos;
CREATE POLICY "lpos_principal_update"
  ON public.lpos
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "lpos_principal_delete" ON public.lpos;
CREATE POLICY "lpos_principal_delete"
  ON public.lpos
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- Bursar, deputy: SELECT only
DROP POLICY IF EXISTS "lpos_bursar_deputy_select" ON public.lpos;
CREATE POLICY "lpos_bursar_deputy_select"
  ON public.lpos
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('bursar', 'deputy')
  );


-- ============================================================
-- 11. grns
-- Storekeeper: INSERT and SELECT only — no UPDATE or DELETE.
-- ============================================================

ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "grns_super_admin_all" ON public.grns;
CREATE POLICY "grns_super_admin_all"
  ON public.grns
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Storekeeper: INSERT GRNs for their school
DROP POLICY IF EXISTS "grns_storekeeper_insert" ON public.grns;
CREATE POLICY "grns_storekeeper_insert"
  ON public.grns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'storekeeper'
  );

-- Storekeeper: SELECT GRNs for their school
DROP POLICY IF EXISTS "grns_storekeeper_select" ON public.grns;
CREATE POLICY "grns_storekeeper_select"
  ON public.grns
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'storekeeper'
  );

-- Principal, bursar, deputy: SELECT only
DROP POLICY IF EXISTS "grns_principal_bursar_deputy_select" ON public.grns;
CREATE POLICY "grns_principal_bursar_deputy_select"
  ON public.grns
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar', 'deputy')
  );


-- ============================================================
-- 12. payments
-- Bursar: INSERT and SELECT only — immutable payment record.
-- ============================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "payments_super_admin_all" ON public.payments;
CREATE POLICY "payments_super_admin_all"
  ON public.payments
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Bursar: INSERT payments for their school
DROP POLICY IF EXISTS "payments_bursar_insert" ON public.payments;
CREATE POLICY "payments_bursar_insert"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

-- Bursar: SELECT payments for their school
DROP POLICY IF EXISTS "payments_bursar_select" ON public.payments;
CREATE POLICY "payments_bursar_select"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

-- Principal: SELECT only
DROP POLICY IF EXISTS "payments_principal_select" ON public.payments;
CREATE POLICY "payments_principal_select"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- BOM member: SELECT only for their school
DROP POLICY IF EXISTS "payments_bom_member_select" ON public.payments;
CREATE POLICY "payments_bom_member_select"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bom_member'
  );


-- ============================================================
-- 13. imprest_advances
-- ============================================================

ALTER TABLE public.imprest_advances ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "imprest_super_admin_all" ON public.imprest_advances;
CREATE POLICY "imprest_super_admin_all"
  ON public.imprest_advances
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal: full CRUD for their school
DROP POLICY IF EXISTS "imprest_principal_select" ON public.imprest_advances;
CREATE POLICY "imprest_principal_select"
  ON public.imprest_advances
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "imprest_principal_insert" ON public.imprest_advances;
CREATE POLICY "imprest_principal_insert"
  ON public.imprest_advances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "imprest_principal_update" ON public.imprest_advances;
CREATE POLICY "imprest_principal_update"
  ON public.imprest_advances
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "imprest_principal_delete" ON public.imprest_advances;
CREATE POLICY "imprest_principal_delete"
  ON public.imprest_advances
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- Bursar: SELECT and UPDATE only (to record surrender / reconcile)
DROP POLICY IF EXISTS "imprest_bursar_select" ON public.imprest_advances;
CREATE POLICY "imprest_bursar_select"
  ON public.imprest_advances
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "imprest_bursar_update" ON public.imprest_advances;
CREATE POLICY "imprest_bursar_update"
  ON public.imprest_advances
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );


-- ============================================================
-- 14. employees
-- ============================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "employees_super_admin_all" ON public.employees;
CREATE POLICY "employees_super_admin_all"
  ON public.employees
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal, bursar: full CRUD for their school
DROP POLICY IF EXISTS "employees_principal_bursar_select" ON public.employees;
CREATE POLICY "employees_principal_bursar_select"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

DROP POLICY IF EXISTS "employees_principal_bursar_insert" ON public.employees;
CREATE POLICY "employees_principal_bursar_insert"
  ON public.employees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

DROP POLICY IF EXISTS "employees_principal_bursar_update" ON public.employees;
CREATE POLICY "employees_principal_bursar_update"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

DROP POLICY IF EXISTS "employees_principal_bursar_delete" ON public.employees;
CREATE POLICY "employees_principal_bursar_delete"
  ON public.employees
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'bursar')
  );

-- Other staff: SELECT only for their school
DROP POLICY IF EXISTS "employees_other_staff_select" ON public.employees;
CREATE POLICY "employees_other_staff_select"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('deputy', 'storekeeper', 'watchman', 'bom_member')
  );


-- ============================================================
-- 15. payroll
-- ============================================================

ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "payroll_super_admin_all" ON public.payroll;
CREATE POLICY "payroll_super_admin_all"
  ON public.payroll
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Bursar: full CRUD for their school
DROP POLICY IF EXISTS "payroll_bursar_select" ON public.payroll;
CREATE POLICY "payroll_bursar_select"
  ON public.payroll
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "payroll_bursar_insert" ON public.payroll;
CREATE POLICY "payroll_bursar_insert"
  ON public.payroll
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "payroll_bursar_update" ON public.payroll;
CREATE POLICY "payroll_bursar_update"
  ON public.payroll
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "payroll_bursar_delete" ON public.payroll;
CREATE POLICY "payroll_bursar_delete"
  ON public.payroll
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

-- Principal: SELECT and UPDATE (approve payroll) for their school
DROP POLICY IF EXISTS "payroll_principal_select" ON public.payroll;
CREATE POLICY "payroll_principal_select"
  ON public.payroll
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

DROP POLICY IF EXISTS "payroll_principal_update" ON public.payroll;
CREATE POLICY "payroll_principal_update"
  ON public.payroll
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- Employees: SELECT their own payroll rows only
-- Joins through employees table to match user_id → employee_id → payroll rows
DROP POLICY IF EXISTS "payroll_employee_select_own" ON public.payroll;
CREATE POLICY "payroll_employee_select_own"
  ON public.payroll
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.employees e
      WHERE  e.id      = payroll.employee_id
      AND    e.user_id = auth.uid()
    )
  );


-- ============================================================
-- 16. gate_passes  (add-on feature — RLS always enforced)
-- ============================================================

ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "gate_passes_super_admin_all" ON public.gate_passes;
CREATE POLICY "gate_passes_super_admin_all"
  ON public.gate_passes
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal, deputy: full CRUD for their school
DROP POLICY IF EXISTS "gate_passes_principal_deputy_select" ON public.gate_passes;
CREATE POLICY "gate_passes_principal_deputy_select"
  ON public.gate_passes
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

DROP POLICY IF EXISTS "gate_passes_principal_deputy_insert" ON public.gate_passes;
CREATE POLICY "gate_passes_principal_deputy_insert"
  ON public.gate_passes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

DROP POLICY IF EXISTS "gate_passes_principal_deputy_update" ON public.gate_passes;
CREATE POLICY "gate_passes_principal_deputy_update"
  ON public.gate_passes
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

DROP POLICY IF EXISTS "gate_passes_principal_deputy_delete" ON public.gate_passes;
CREATE POLICY "gate_passes_principal_deputy_delete"
  ON public.gate_passes
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

-- Watchman: INSERT (create pass on physical exit) and SELECT for their school
DROP POLICY IF EXISTS "gate_passes_watchman_insert" ON public.gate_passes;
CREATE POLICY "gate_passes_watchman_insert"
  ON public.gate_passes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'watchman'
  );

DROP POLICY IF EXISTS "gate_passes_watchman_select" ON public.gate_passes;
CREATE POLICY "gate_passes_watchman_select"
  ON public.gate_passes
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'watchman'
  );

-- Parents: SELECT pass records for their linked students only
DROP POLICY IF EXISTS "gate_passes_parent_select_linked" ON public.gate_passes;
CREATE POLICY "gate_passes_parent_select_linked"
  ON public.gate_passes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = gate_passes.student_id
    )
  );


-- ============================================================
-- 17. visitor_log  (add-on feature — RLS always enforced)
-- ============================================================

ALTER TABLE public.visitor_log ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "visitor_log_super_admin_all" ON public.visitor_log;
CREATE POLICY "visitor_log_super_admin_all"
  ON public.visitor_log
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal, deputy, watchman: full CRUD for their school
DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_select" ON public.visitor_log;
CREATE POLICY "visitor_log_principal_deputy_watchman_select"
  ON public.visitor_log
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy', 'watchman')
  );

DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_insert" ON public.visitor_log;
CREATE POLICY "visitor_log_principal_deputy_watchman_insert"
  ON public.visitor_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy', 'watchman')
  );

DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_update" ON public.visitor_log;
CREATE POLICY "visitor_log_principal_deputy_watchman_update"
  ON public.visitor_log
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy', 'watchman')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy', 'watchman')
  );

DROP POLICY IF EXISTS "visitor_log_principal_deputy_watchman_delete" ON public.visitor_log;
CREATE POLICY "visitor_log_principal_deputy_watchman_delete"
  ON public.visitor_log
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy', 'watchman')
  );

-- Bursar, storekeeper: SELECT only for their school
DROP POLICY IF EXISTS "visitor_log_bursar_storekeeper_select" ON public.visitor_log;
CREATE POLICY "visitor_log_bursar_storekeeper_select"
  ON public.visitor_log
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('bursar', 'storekeeper')
  );


-- ============================================================
-- 18. staff_attendance  (add-on feature — RLS always enforced)
-- ============================================================

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "staff_attendance_super_admin_all" ON public.staff_attendance;
CREATE POLICY "staff_attendance_super_admin_all"
  ON public.staff_attendance
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Principal, deputy: full CRUD for their school
DROP POLICY IF EXISTS "staff_attendance_principal_deputy_select" ON public.staff_attendance;
CREATE POLICY "staff_attendance_principal_deputy_select"
  ON public.staff_attendance
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

DROP POLICY IF EXISTS "staff_attendance_principal_deputy_insert" ON public.staff_attendance;
CREATE POLICY "staff_attendance_principal_deputy_insert"
  ON public.staff_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

DROP POLICY IF EXISTS "staff_attendance_principal_deputy_update" ON public.staff_attendance;
CREATE POLICY "staff_attendance_principal_deputy_update"
  ON public.staff_attendance
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

DROP POLICY IF EXISTS "staff_attendance_principal_deputy_delete" ON public.staff_attendance;
CREATE POLICY "staff_attendance_principal_deputy_delete"
  ON public.staff_attendance
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid())
        IN ('principal', 'deputy')
  );

-- Bursar: SELECT only (for payroll deduction calculations)
DROP POLICY IF EXISTS "staff_attendance_bursar_select" ON public.staff_attendance;
CREATE POLICY "staff_attendance_bursar_select"
  ON public.staff_attendance
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

-- Employees: SELECT their own attendance records only
DROP POLICY IF EXISTS "staff_attendance_employee_select_own" ON public.staff_attendance;
CREATE POLICY "staff_attendance_employee_select_own"
  ON public.staff_attendance
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.employees e
      WHERE  e.id      = staff_attendance.employee_id
      AND    e.user_id = auth.uid()
    )
  );


-- ============================================================
-- 19. pocket_money_ledger  (add-on feature — RLS always enforced)
-- ============================================================

ALTER TABLE public.pocket_money_ledger ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "pml_super_admin_all" ON public.pocket_money_ledger;
CREATE POLICY "pml_super_admin_all"
  ON public.pocket_money_ledger
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Bursar: full CRUD for their school
DROP POLICY IF EXISTS "pml_bursar_select" ON public.pocket_money_ledger;
CREATE POLICY "pml_bursar_select"
  ON public.pocket_money_ledger
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "pml_bursar_insert" ON public.pocket_money_ledger;
CREATE POLICY "pml_bursar_insert"
  ON public.pocket_money_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "pml_bursar_update" ON public.pocket_money_ledger;
CREATE POLICY "pml_bursar_update"
  ON public.pocket_money_ledger
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "pml_bursar_delete" ON public.pocket_money_ledger;
CREATE POLICY "pml_bursar_delete"
  ON public.pocket_money_ledger
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

-- Principal: SELECT only
DROP POLICY IF EXISTS "pml_principal_select" ON public.pocket_money_ledger;
CREATE POLICY "pml_principal_select"
  ON public.pocket_money_ledger
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- Parents: SELECT ledger rows for their linked students only
DROP POLICY IF EXISTS "pml_parent_select_linked" ON public.pocket_money_ledger;
CREATE POLICY "pml_parent_select_linked"
  ON public.pocket_money_ledger
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = pocket_money_ledger.student_id
    )
  );


-- ============================================================
-- 20. pocket_money_balances  (add-on feature — RLS always enforced)
-- ============================================================

ALTER TABLE public.pocket_money_balances ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "pmb_super_admin_all" ON public.pocket_money_balances;
CREATE POLICY "pmb_super_admin_all"
  ON public.pocket_money_balances
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Bursar: full CRUD for their school
DROP POLICY IF EXISTS "pmb_bursar_select" ON public.pocket_money_balances;
CREATE POLICY "pmb_bursar_select"
  ON public.pocket_money_balances
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "pmb_bursar_insert" ON public.pocket_money_balances;
CREATE POLICY "pmb_bursar_insert"
  ON public.pocket_money_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "pmb_bursar_update" ON public.pocket_money_balances;
CREATE POLICY "pmb_bursar_update"
  ON public.pocket_money_balances
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "pmb_bursar_delete" ON public.pocket_money_balances;
CREATE POLICY "pmb_bursar_delete"
  ON public.pocket_money_balances
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

-- Principal: SELECT only
DROP POLICY IF EXISTS "pmb_principal_select" ON public.pocket_money_balances;
CREATE POLICY "pmb_principal_select"
  ON public.pocket_money_balances
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- Parents: SELECT balance for their linked students only
DROP POLICY IF EXISTS "pmb_parent_select_linked" ON public.pocket_money_balances;
CREATE POLICY "pmb_parent_select_linked"
  ON public.pocket_money_balances
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = pocket_money_balances.student_id
    )
  );


-- ============================================================
-- 21. bread_vouchers  (add-on feature — RLS always enforced)
-- ============================================================

ALTER TABLE public.bread_vouchers ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "bread_vouchers_super_admin_all" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_super_admin_all"
  ON public.bread_vouchers
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Bursar: full CRUD for their school
DROP POLICY IF EXISTS "bread_vouchers_bursar_select" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_bursar_select"
  ON public.bread_vouchers
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "bread_vouchers_bursar_insert" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_bursar_insert"
  ON public.bread_vouchers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "bread_vouchers_bursar_update" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_bursar_update"
  ON public.bread_vouchers
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

DROP POLICY IF EXISTS "bread_vouchers_bursar_delete" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_bursar_delete"
  ON public.bread_vouchers
  FOR DELETE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'bursar'
  );

-- Principal: SELECT only
DROP POLICY IF EXISTS "bread_vouchers_principal_select" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_principal_select"
  ON public.bread_vouchers
  FOR SELECT
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'principal'
  );

-- Watchman: UPDATE only — to mark redeemed = true at the gate
DROP POLICY IF EXISTS "bread_vouchers_watchman_update" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_watchman_update"
  ON public.bread_vouchers
  FOR UPDATE
  TO authenticated
  USING (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'watchman'
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'watchman'
  );

-- Parents: SELECT vouchers for their linked students only
DROP POLICY IF EXISTS "bread_vouchers_parent_select_linked" ON public.bread_vouchers;
CREATE POLICY "bread_vouchers_parent_select_linked"
  ON public.bread_vouchers
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role::TEXT FROM public.users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM   public.student_parents sp
      WHERE  sp.parent_id  = auth.uid()
      AND    sp.student_id = bread_vouchers.student_id
    )
  );


-- ============================================================
-- 22. system_logs
-- Super admin only — no other role has any access.
-- ============================================================

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_logs_super_admin_all" ON public.system_logs;
CREATE POLICY "system_logs_super_admin_all"
  ON public.system_logs
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));


-- ============================================================
-- 23. global_settings
-- ============================================================

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "global_settings_super_admin_all" ON public.global_settings;
CREATE POLICY "global_settings_super_admin_all"
  ON public.global_settings
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- All authenticated users: SELECT only (to read addon pricing etc.)
DROP POLICY IF EXISTS "global_settings_authenticated_select" ON public.global_settings;
CREATE POLICY "global_settings_authenticated_select"
  ON public.global_settings
  FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- 24. user_subscriptions
-- ============================================================

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admin: unrestricted
DROP POLICY IF EXISTS "user_subscriptions_super_admin_all" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions_super_admin_all"
  ON public.user_subscriptions
  FOR ALL
  TO authenticated
  USING     ((SELECT is_super_admin FROM public.users WHERE id = auth.uid()))
  WITH CHECK((SELECT is_super_admin FROM public.users WHERE id = auth.uid()));

-- Users: INSERT their own subscription rows
DROP POLICY IF EXISTS "user_subscriptions_insert_own" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions_insert_own"
  ON public.user_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users: SELECT their own subscription rows
DROP POLICY IF EXISTS "user_subscriptions_select_own" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions_select_own"
  ON public.user_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

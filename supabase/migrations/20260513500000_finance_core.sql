-- ============================================================
-- MIGRATION: Finance Core — Multi-bank ledger, MoE capitation,
-- casual payroll, financial AIE requisitions
-- ============================================================

-- Multi-bank ledger (MoE-mandated fund isolation)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  account_name   text    NOT NULL CHECK (account_name IN ('Tuition_A/C','Operations_A/C','Boarding_BOM_A/C')),
  bank_name      text    NOT NULL,
  account_number text    NOT NULL,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- MoE capitation disbursements (FDSE term allocations)
CREATE TABLE IF NOT EXISTS public.moe_capitation_disbursements (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year         int     NOT NULL,
  term                  int     NOT NULL CHECK (term IN (1,2,3)),
  total_received_amount numeric(14,2) NOT NULL,
  date_disbursed        date    NOT NULL,
  reference_number      text,
  bank_account_id       uuid    REFERENCES public.bank_accounts(id),
  created_at            timestamptz DEFAULT now()
);

-- Per-vote-head allocations from each disbursement
CREATE TABLE IF NOT EXISTS public.capitation_vote_head_allocations (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  disbursement_id       uuid    NOT NULL REFERENCES public.moe_capitation_disbursements(id) ON DELETE CASCADE,
  school_id             uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  vote_head_name        text    NOT NULL,
  per_student_amount    numeric(10,2) NOT NULL DEFAULT 0,
  total_allocated_amount numeric(14,2) NOT NULL,
  created_at            timestamptz DEFAULT now()
);

-- Financial AIE requisitions (Principal approval gate)
-- NOTE: distinct from storekeeper aie_forms which tracks inventory
CREATE TABLE IF NOT EXISTS public.financial_aie_requisitions (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bursar_user_id      uuid    REFERENCES auth.users(id),
  principal_user_id   uuid    REFERENCES auth.users(id),
  bank_account_id     uuid    REFERENCES public.bank_accounts(id),
  vote_head_category  text    NOT NULL,
  item_description    text    NOT NULL,
  voucher_number      text    UNIQUE,
  total_amount        numeric(14,2) NOT NULL,
  status              text    NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft','Pending_Principal_Approval','Approved_AIE_Granted','Rejected_By_Principal')),
  rejection_reason    text,
  signature_method    text,
  signature_hash      text,
  signed_at           timestamptz,
  webpush_sent_at     timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- Expenditures per vote-head (backed by AIE)
CREATE TABLE IF NOT EXISTS public.vote_head_expenditures (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  vote_head_allocation_id uuid    NOT NULL REFERENCES public.capitation_vote_head_allocations(id) ON DELETE CASCADE,
  aie_requisition_id      uuid    REFERENCES public.financial_aie_requisitions(id) ON DELETE SET NULL,
  item_name               text    NOT NULL,
  voucher_number          text    NOT NULL,
  amount_spent            numeric(14,2) NOT NULL,
  transaction_date        date    NOT NULL DEFAULT current_date,
  created_at              timestamptz DEFAULT now()
);

-- BOM casual employees (separate from TSC/NTS staff_records)
CREATE TABLE IF NOT EXISTS public.casual_employees (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  national_id          text    NOT NULL,
  full_name            text    NOT NULL,
  role                 text    NOT NULL DEFAULT 'Casual',
  basic_salary         numeric(10,2) NOT NULL DEFAULT 0,
  kra_pin              text,
  nssf_number          text,
  shif_number          text,
  bank_account_number  text,
  bank_name            text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz DEFAULT now()
);

-- Monthly payroll for casual employees
CREATE TABLE IF NOT EXISTS public.casual_payroll_runs (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employee_id          uuid    NOT NULL REFERENCES public.casual_employees(id) ON DELETE CASCADE,
  aie_requisition_id   uuid    REFERENCES public.financial_aie_requisitions(id),
  month_year           text    NOT NULL,
  days_worked          int     NOT NULL DEFAULT 26,
  gross_salary         numeric(10,2) NOT NULL,
  nssf_tier1           numeric(8,2) NOT NULL DEFAULT 0,
  nssf_tier2           numeric(8,2) NOT NULL DEFAULT 0,
  shif_deduction       numeric(8,2) NOT NULL DEFAULT 0,
  paye_deduction       numeric(8,2) NOT NULL DEFAULT 0,
  housing_levy         numeric(8,2) NOT NULL DEFAULT 0,
  net_pay              numeric(10,2) NOT NULL DEFAULT 0,
  status               text    NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Disbursed')),
  disbursed_at         timestamptz,
  created_at           timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bank_accounts_school
  ON public.bank_accounts (school_id);
CREATE INDEX IF NOT EXISTS idx_capitation_school_year
  ON public.moe_capitation_disbursements (school_id, academic_year, term);
CREATE INDEX IF NOT EXISTS idx_aie_fin_status
  ON public.financial_aie_requisitions (school_id, status);
CREATE INDEX IF NOT EXISTS idx_casual_payroll_school_month
  ON public.casual_payroll_runs (school_id, month_year);
CREATE INDEX IF NOT EXISTS idx_casual_employees_school
  ON public.casual_employees (school_id, is_active);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.bank_accounts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moe_capitation_disbursements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capitation_vote_head_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_aie_requisitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_head_expenditures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casual_employees                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casual_payroll_runs             ENABLE ROW LEVEL SECURITY;

-- bank_accounts
CREATE POLICY "bank_accounts_read" ON public.bank_accounts FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "bank_accounts_admin_write" ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "bank_accounts_admin_update" ON public.bank_accounts FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());

-- moe_capitation_disbursements
CREATE POLICY "capitation_read" ON public.moe_capitation_disbursements FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "capitation_admin_write" ON public.moe_capitation_disbursements FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());

-- capitation_vote_head_allocations
CREATE POLICY "cvha_read" ON public.capitation_vote_head_allocations FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "cvha_admin_write" ON public.capitation_vote_head_allocations FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());

-- financial_aie_requisitions
CREATE POLICY "fair_read" ON public.financial_aie_requisitions FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "fair_bursar_insert" ON public.financial_aie_requisitions FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id());
CREATE POLICY "fair_principal_update" ON public.financial_aie_requisitions FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id());

-- vote_head_expenditures
CREATE POLICY "vhe_read" ON public.vote_head_expenditures FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "vhe_admin_write" ON public.vote_head_expenditures FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());

-- casual_employees
CREATE POLICY "casual_emp_read" ON public.casual_employees FOR SELECT TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "casual_emp_write" ON public.casual_employees FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "casual_emp_update" ON public.casual_employees FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());

-- casual_payroll_runs
CREATE POLICY "payroll_read" ON public.casual_payroll_runs FOR SELECT TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "payroll_write" ON public.casual_payroll_runs FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "payroll_update" ON public.casual_payroll_runs FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());

-- ============================================================
-- LIVE VOTE-HEAD BALANCE VIEW (with VIOLATION flag)
-- ============================================================
CREATE OR REPLACE VIEW public.view_vote_head_balances AS
SELECT
  a.id                                                    AS allocation_id,
  a.school_id,
  d.academic_year,
  d.term,
  d.date_disbursed,
  a.vote_head_name,
  a.total_allocated_amount                                AS budget,
  COALESCE(SUM(e.amount_spent), 0)                       AS total_spent,
  a.total_allocated_amount - COALESCE(SUM(e.amount_spent), 0) AS unspent_balance,
  CASE
    WHEN COALESCE(SUM(e.amount_spent), 0) > a.total_allocated_amount THEN 'VOTE_HEAD_VIOLATION'
    ELSE 'OK'
  END                                                     AS compliance_status
FROM public.capitation_vote_head_allocations a
JOIN public.moe_capitation_disbursements d ON d.id = a.disbursement_id
LEFT JOIN public.vote_head_expenditures e ON e.vote_head_allocation_id = a.id
GROUP BY
  a.id, a.school_id, d.academic_year, d.term, d.date_disbursed,
  a.vote_head_name, a.total_allocated_amount;

-- NOTE: Fee aging analysis is computed in the TypeScript server function
-- (finance.functions.ts) to handle schema variations across deployments.

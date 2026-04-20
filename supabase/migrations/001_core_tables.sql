-- ============================================================
-- SYCHAR COPILOT — MIGRATION 001: CORE TABLES
-- ============================================================
--
-- SECTIONS:
--   A.  ENUMS              — log_level, log_category, lpo_status,
--                            imprest_status, user_role
--   B.  NEW TABLE          — schools
--   C.  NEW TABLE          — global_settings
--   D.  ALTER TABLE        — users
--   E.  ALTER TABLE        — students
--   F.  ALTER TABLE        — parents
--   G.  ALTER TABLE        — attendance
--   H.  NEW TABLE          — student_parents
--   I.  NEW TABLE          — fee_structures
--   J.  NEW TABLE          — fee_balances
--   K.  NEW TABLE          — fee_transactions
--   L.  NEW TABLE          — bursaries
--   M.  NEW TABLE          — vote_heads
--   N.  NEW TABLE          — lpos
--   O.  NEW TABLE          — grns
--   P.  NEW TABLE          — payments
--   Q.  NEW TABLE          — imprest_advances
--   R.  NEW TABLE          — employees
--   S.  NEW TABLE          — payroll
--   T.  NEW TABLE          — pocket_money_ledger
--   U.  NEW TABLE          — pocket_money_balances
--   V.  NEW TABLE          — bread_vouchers
--   W.  NEW TABLE          — staff_attendance
--   X.  NEW TABLE          — gate_passes
--   Y.  NEW TABLE          — visitor_log
--   Z.  NEW TABLE          — system_logs
--   AA. NEW TABLE          — user_subscriptions
--
-- ============================================================


-- ============================================================
-- A. ENUMS
-- Every CREATE TYPE is wrapped in a DO $$ block that checks
-- pg_type first, making this section fully idempotent.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type     t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  t.typname   = 'log_level'
    AND    n.nspname   = 'public'
  ) THEN
    CREATE TYPE public.log_level AS ENUM (
      'info',
      'warning',
      'error',
      'critical'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type     t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  t.typname   = 'log_category'
    AND    n.nspname   = 'public'
  ) THEN
    CREATE TYPE public.log_category AS ENUM (
      'api',
      'offline_sync',
      'network_latency',
      'auth',
      'database'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type     t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  t.typname   = 'lpo_status'
    AND    n.nspname   = 'public'
  ) THEN
    CREATE TYPE public.lpo_status AS ENUM (
      'Pending',
      'Partially_Fulfilled',
      'Completed',
      'Voided'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type     t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  t.typname   = 'imprest_status'
    AND    n.nspname   = 'public'
  ) THEN
    CREATE TYPE public.imprest_status AS ENUM (
      'Open',
      'Partially_Surrendered',
      'Fully_Surrendered'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type     t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  t.typname   = 'user_role'
    AND    n.nspname   = 'public'
  ) THEN
    CREATE TYPE public.user_role AS ENUM (
      'super_admin',
      'principal',
      'bursar',
      'storekeeper',
      'deputy',
      'bom_member',
      'parent',
      'watchman'
    );
  END IF;
END $$;


-- ============================================================
-- B. NEW TABLE: schools
-- Must be created before the ALTER TABLE users section
-- because users.school_id references schools(id).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schools (
  id                      UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name                    TEXT          NOT NULL,
  county                  TEXT          NOT NULL,
  sub_county              TEXT,
  knec_code               TEXT          UNIQUE,
  student_count           INTEGER       DEFAULT 0,
  contact_name            TEXT,
  contact_phone           TEXT,
  contact_email           TEXT,
  features                JSONB         DEFAULT '{
    "gate_pass":        false,
    "visitor_log":      false,
    "staff_attendance": false,
    "pocket_money":     false,
    "bread_voucher":    false
  }'::jsonb,
  is_active               BOOLEAN       DEFAULT true,
  subscription_expires_at TIMESTAMPTZ   DEFAULT (NOW() + INTERVAL '1 year'),
  created_at              TIMESTAMPTZ   DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_knec_code
  ON public.schools (knec_code);

CREATE INDEX IF NOT EXISTS idx_schools_is_active
  ON public.schools (is_active);


-- ============================================================
-- C. NEW TABLE: global_settings
-- Single-row singleton enforced by CHECK (id = 1).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.global_settings (
  id            INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  addon_pricing JSONB       DEFAULT '{
    "gate_pass":        15000,
    "visitor_log":      6000,
    "staff_attendance": 10000,
    "pocket_money":     8000,
    "bread_voucher":    8000
  }'::jsonb,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.global_settings (id)
VALUES (1)
ON CONFLICT DO NOTHING;


-- ============================================================
-- D. ALTER TABLE: users
-- schools must already exist (section B) before this runs
-- because of the FK reference to schools(id).
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role              public.user_role DEFAULT 'parent',
  ADD COLUMN IF NOT EXISTS is_super_admin    BOOLEAN          DEFAULT false,
  ADD COLUMN IF NOT EXISTS school_id         UUID             REFERENCES public.schools (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kra_pin           TEXT,
  ADD COLUMN IF NOT EXISTS push_subscription JSONB;

CREATE INDEX IF NOT EXISTS idx_users_school_id
  ON public.users (school_id);

CREATE INDEX IF NOT EXISTS idx_users_role
  ON public.users (role);


-- ============================================================
-- E. ALTER TABLE: students
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS nemis_upi    TEXT    UNIQUE,
  ADD COLUMN IF NOT EXISTS form         INTEGER CHECK (form BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS stream       TEXT,
  ADD COLUMN IF NOT EXISTS photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS is_in_school BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_students_form_stream
  ON public.students (form, stream);

CREATE INDEX IF NOT EXISTS idx_students_is_in_school
  ON public.students (is_in_school);


-- ============================================================
-- F. ALTER TABLE: parents
-- ============================================================

ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS push_subscription JSONB;


-- ============================================================
-- G. ALTER TABLE: attendance
-- ============================================================

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recorded_by  UUID REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_recorded_by
  ON public.attendance (recorded_by);


-- ============================================================
-- H. NEW TABLE: student_parents
-- Composite primary key — no separate UUID id column needed.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_parents (
  student_id   UUID NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  parent_id    UUID NOT NULL REFERENCES public.parents  (id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'Parent',
  PRIMARY KEY (student_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_student_parents_parent_id
  ON public.student_parents (parent_id);


-- ============================================================
-- I. NEW TABLE: fee_structures
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fee_structures (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   UUID          NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  form        INTEGER       CHECK (form BETWEEN 1 AND 4),
  term        INTEGER       CHECK (term BETWEEN 1 AND 3),
  year        INTEGER       NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_school_id
  ON public.fee_structures (school_id);

CREATE INDEX IF NOT EXISTS idx_fee_structures_school_form_term_year
  ON public.fee_structures (school_id, form, term, year);


-- ============================================================
-- J. NEW TABLE: fee_balances
-- current_balance is a generated stored column — always equal
-- to (invoiced_amount - paid_amount), updated automatically.
-- UNIQUE on student_id enforces one balance row per student.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fee_balances (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        UUID          NOT NULL REFERENCES public.schools  (id) ON DELETE CASCADE,
  student_id       UUID          NOT NULL REFERENCES public.students (id) ON DELETE CASCADE UNIQUE,
  invoiced_amount  NUMERIC(12,2) DEFAULT 0,
  paid_amount      NUMERIC(12,2) DEFAULT 0,
  current_balance  NUMERIC(12,2) GENERATED ALWAYS AS (invoiced_amount - paid_amount) STORED,
  last_payment_at  TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_balances_school_id
  ON public.fee_balances (school_id);

CREATE INDEX IF NOT EXISTS idx_fee_balances_student_id
  ON public.fee_balances (student_id);


-- ============================================================
-- K. NEW TABLE: fee_transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fee_transactions (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   UUID          NOT NULL REFERENCES public.schools  (id) ON DELETE CASCADE,
  student_id  UUID          NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  type        TEXT          NOT NULL CHECK (type IN ('Invoice','Payment','Bursary','Reversal')),
  reference   TEXT,
  term        INTEGER,
  year        INTEGER,
  recorded_by UUID          REFERENCES public.users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_transactions_student_id
  ON public.fee_transactions (student_id);

CREATE INDEX IF NOT EXISTS idx_fee_transactions_school_created_at
  ON public.fee_transactions (school_id, created_at DESC);


-- ============================================================
-- L. NEW TABLE: bursaries
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bursaries (
  id                      UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id               UUID          NOT NULL REFERENCES public.schools  (id) ON DELETE CASCADE,
  student_id              UUID          NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  source                  TEXT          NOT NULL,
  amount                  NUMERIC(12,2) NOT NULL,
  award_reference         TEXT,
  cheque_or_eft_reference TEXT,
  year                    INTEGER,
  applied_at              TIMESTAMPTZ   DEFAULT NOW(),
  recorded_by             UUID          REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bursaries_school_id
  ON public.bursaries (school_id);

CREATE INDEX IF NOT EXISTS idx_bursaries_student_id
  ON public.bursaries (student_id);


-- ============================================================
-- M. NEW TABLE: vote_heads
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vote_heads (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      UUID          NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  code           TEXT          NOT NULL,
  name           TEXT          NOT NULL,
  category       TEXT          NOT NULL CHECK (category IN ('Operations','Tuition')),
  annual_budget  NUMERIC(12,2) DEFAULT 0,
  year           INTEGER       NOT NULL,
  UNIQUE (school_id, code, year)
);

CREATE INDEX IF NOT EXISTS idx_vote_heads_school_id
  ON public.vote_heads (school_id);

CREATE INDEX IF NOT EXISTS idx_vote_heads_school_year
  ON public.vote_heads (school_id, year);


-- ============================================================
-- N. NEW TABLE: lpos
-- aie_user_id uses ON DELETE RESTRICT — an LPO must not lose
-- its authorising officer silently.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lpos (
  id                UUID              DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id         UUID              NOT NULL REFERENCES public.schools    (id) ON DELETE CASCADE,
  vote_head_id      UUID              REFERENCES public.vote_heads (id) ON DELETE SET NULL,
  aie_user_id       UUID              NOT NULL REFERENCES public.users      (id) ON DELETE RESTRICT,
  vendor_name       TEXT              NOT NULL,
  description       TEXT              NOT NULL,
  authorized_amount NUMERIC(12,2)     NOT NULL,
  status            public.lpo_status DEFAULT 'Pending',
  created_at        TIMESTAMPTZ       DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lpos_school_id
  ON public.lpos (school_id);

CREATE INDEX IF NOT EXISTS idx_lpos_school_status
  ON public.lpos (school_id, status);

CREATE INDEX IF NOT EXISTS idx_lpos_aie_user_id
  ON public.lpos (aie_user_id);


-- ============================================================
-- O. NEW TABLE: grns (Goods Received Notes)
-- storekeeper_id uses ON DELETE RESTRICT for the same reason
-- as aie_user_id on lpos — receiver identity must be retained.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.grns (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id               UUID        NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  lpo_id                  UUID        NOT NULL REFERENCES public.lpos    (id) ON DELETE CASCADE,
  storekeeper_id          UUID        NOT NULL REFERENCES public.users   (id) ON DELETE RESTRICT,
  delivery_note_reference TEXT,
  notes                   TEXT,
  received_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grns_lpo_id
  ON public.grns (lpo_id);

CREATE INDEX IF NOT EXISTS idx_grns_school_id
  ON public.grns (school_id);


-- ============================================================
-- P. NEW TABLE: payments
-- bursar_id uses ON DELETE RESTRICT — payment approver identity
-- must be preserved for audit purposes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id         UUID          NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  lpo_id            UUID          NOT NULL REFERENCES public.lpos    (id) ON DELETE CASCADE,
  grn_id            UUID          NOT NULL REFERENCES public.grns    (id) ON DELETE CASCADE,
  bursar_id         UUID          NOT NULL REFERENCES public.users   (id) ON DELETE RESTRICT,
  amount_paid       NUMERIC(12,2) NOT NULL,
  payment_reference TEXT,
  paid_at           TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_lpo_id
  ON public.payments (lpo_id);

CREATE INDEX IF NOT EXISTS idx_payments_school_id
  ON public.payments (school_id);


-- ============================================================
-- Q. NEW TABLE: imprest_advances
-- is_fully_reconciled is a generated stored column.
-- voucher_number is globally unique across all schools.
-- aie_user_id uses ON DELETE RESTRICT for audit integrity.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.imprest_advances (
  id                  UUID                  DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           UUID                  NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  aie_user_id         UUID                  NOT NULL REFERENCES public.users   (id) ON DELETE RESTRICT,
  reason              TEXT                  NOT NULL,
  amount_issued       NUMERIC(12,2)         NOT NULL,
  amount_surrendered  NUMERIC(12,2)         DEFAULT 0,
  status              public.imprest_status DEFAULT 'Open',
  is_fully_reconciled BOOLEAN               GENERATED ALWAYS AS
                        (amount_surrendered >= amount_issued) STORED,
  voucher_number      TEXT                  UNIQUE,
  issued_at           TIMESTAMPTZ           DEFAULT NOW(),
  surrendered_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_imprest_advances_school_status
  ON public.imprest_advances (school_id, status);

CREATE INDEX IF NOT EXISTS idx_imprest_advances_aie_user_id
  ON public.imprest_advances (aie_user_id);


-- ============================================================
-- R. NEW TABLE: employees
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    UUID          NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  user_id      UUID          REFERENCES public.users (id) ON DELETE SET NULL,
  full_name    TEXT          NOT NULL,
  tsc_number   TEXT,
  kra_pin      TEXT,
  nssf_number  TEXT,
  bank_account TEXT,
  gross_salary NUMERIC(12,2) NOT NULL,
  job_title    TEXT,
  department   TEXT          CHECK (department IN ('Teaching','Non-Teaching')),
  is_active    BOOLEAN       DEFAULT true,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_school_id
  ON public.employees (school_id);

CREATE INDEX IF NOT EXISTS idx_employees_user_id
  ON public.employees (user_id);

CREATE INDEX IF NOT EXISTS idx_employees_school_active
  ON public.employees (school_id, is_active);

CREATE INDEX IF NOT EXISTS idx_employees_department
  ON public.employees (school_id, department);


-- ============================================================
-- S. NEW TABLE: payroll
-- UNIQUE on (school_id, employee_id, month, year) prevents
-- a payroll run being submitted twice for the same period.
-- approved_by uses ON DELETE SET NULL so the row survives if
-- the approving user account is deleted.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payroll (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    UUID          NOT NULL REFERENCES public.schools   (id) ON DELETE CASCADE,
  employee_id  UUID          NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  month        INTEGER       NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         INTEGER       NOT NULL,
  basic_salary NUMERIC(12,2) NOT NULL,
  allowances   NUMERIC(12,2) DEFAULT 0,
  nssf         NUMERIC(12,2),
  shif         NUMERIC(12,2),
  housing_levy NUMERIC(12,2),
  paye         NUMERIC(12,2),
  net_salary   NUMERIC(12,2),
  approved_by  UUID          REFERENCES public.users (id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (school_id, employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_school_id
  ON public.payroll (school_id);

CREATE INDEX IF NOT EXISTS idx_payroll_employee_id
  ON public.payroll (employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_school_year_month
  ON public.payroll (school_id, year DESC, month DESC);


-- ============================================================
-- T. NEW TABLE: pocket_money_ledger
-- Append-only transaction log for student pocket money.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pocket_money_ledger (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id     UUID          NOT NULL REFERENCES public.schools  (id) ON DELETE CASCADE,
  student_id    UUID          NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  type          TEXT          NOT NULL CHECK (type IN ('TopUp','Withdrawal','Adjustment')),
  amount        NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  reference     TEXT,
  recorded_by   UUID          REFERENCES public.users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pocket_money_ledger_student_id
  ON public.pocket_money_ledger (student_id);

CREATE INDEX IF NOT EXISTS idx_pocket_money_ledger_school_created_at
  ON public.pocket_money_ledger (school_id, created_at DESC);


-- ============================================================
-- U. NEW TABLE: pocket_money_balances
-- One row per student — UNIQUE on student_id enforces this.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pocket_money_balances (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       UUID          NOT NULL REFERENCES public.schools  (id) ON DELETE CASCADE,
  student_id      UUID          NOT NULL REFERENCES public.students (id) ON DELETE CASCADE UNIQUE,
  current_balance NUMERIC(10,2) DEFAULT 0,
  total_topped_up NUMERIC(10,2) DEFAULT 0,
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pocket_money_balances_school_id
  ON public.pocket_money_balances (school_id);

CREATE INDEX IF NOT EXISTS idx_pocket_money_balances_student_id
  ON public.pocket_money_balances (student_id);


-- ============================================================
-- V. NEW TABLE: bread_vouchers
-- total_cost is a generated stored column (quantity * unit_cost).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bread_vouchers (
  id           UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    UUID          NOT NULL REFERENCES public.schools  (id) ON DELETE CASCADE,
  student_id   UUID          NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  voucher_date DATE          NOT NULL,
  quantity     INTEGER       DEFAULT 1,
  unit_cost    NUMERIC(8,2)  NOT NULL,
  total_cost   NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  redeemed     BOOLEAN       DEFAULT false,
  redeemed_at  TIMESTAMPTZ,
  issued_by    UUID          REFERENCES public.users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bread_vouchers_student_id
  ON public.bread_vouchers (student_id);

CREATE INDEX IF NOT EXISTS idx_bread_vouchers_school_date
  ON public.bread_vouchers (school_id, voucher_date);


-- ============================================================
-- W. NEW TABLE: staff_attendance
-- UNIQUE on (school_id, employee_id, date) prevents duplicate
-- attendance records for the same employee on the same day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    UUID        NOT NULL REFERENCES public.schools   (id) ON DELETE CASCADE,
  employee_id  UUID        NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  date         DATE        NOT NULL,
  check_in_at  TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status       TEXT        DEFAULT 'Present'
                           CHECK (status IN ('Present','Absent','Late','Half-Day','Leave')),
  department   TEXT        CHECK (department IN ('Teaching','Non-Teaching')),
  recorded_by  UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_school_date
  ON public.staff_attendance (school_id, date);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_employee_id
  ON public.staff_attendance (employee_id);


-- ============================================================
-- X. NEW TABLE: gate_passes
-- authorized_by and confirmed_by both ON DELETE SET NULL so
-- pass history is preserved even if users are deleted.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gate_passes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id     UUID        NOT NULL REFERENCES public.schools  (id) ON DELETE CASCADE,
  student_id    UUID        NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('Exit','Entry')),
  reason        TEXT,
  authorized_by UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  confirmed_by  UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  status        TEXT        DEFAULT 'Pending'
                            CHECK (status IN ('Pending','Approved','Rejected','Completed')),
  requested_at  TIMESTAMPTZ DEFAULT NOW(),
  approved_at   TIMESTAMPTZ,
  exited_at     TIMESTAMPTZ,
  returned_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gate_passes_school_status
  ON public.gate_passes (school_id, status);

CREATE INDEX IF NOT EXISTS idx_gate_passes_student_id
  ON public.gate_passes (student_id);


-- ============================================================
-- Y. NEW TABLE: visitor_log
-- Both host_user_id and recorded_by use ON DELETE SET NULL
-- so visitor history is never deleted with a user account.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visitor_log (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    UUID        NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  full_name    TEXT        NOT NULL,
  id_number    TEXT,
  phone        TEXT,
  purpose      TEXT        NOT NULL,
  host_user_id UUID        REFERENCES public.users (id) ON DELETE SET NULL,
  photo_url    TEXT,
  check_in_at  TIMESTAMPTZ DEFAULT NOW(),
  check_out_at TIMESTAMPTZ,
  badge_number TEXT,
  recorded_by  UUID        REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_visitor_log_school_check_in_at
  ON public.visitor_log (school_id, check_in_at DESC);


-- ============================================================
-- Z. NEW TABLE: system_logs
-- school_id uses ON DELETE SET NULL — log rows must survive
-- school deletion for super-admin forensic review.
-- High-volume table: three separate indexes for filtering.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_logs (
  id         UUID                DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id  UUID                REFERENCES public.schools (id) ON DELETE SET NULL,
  level      public.log_level    NOT NULL,
  category   public.log_category NOT NULL,
  endpoint   TEXT,
  latency_ms INTEGER,
  message    TEXT                NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ         DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_school_id
  ON public.system_logs (school_id);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at
  ON public.system_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_level
  ON public.system_logs (level);


-- ============================================================
-- AA. NEW TABLE: user_subscriptions
-- Stores Web Push API subscription objects.
-- One user may have multiple subscriptions (multiple devices).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES public.users   (id) ON DELETE CASCADE,
  school_id    UUID        NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  user_type    TEXT        CHECK (user_type IN ('staff','parent')),
  subscription JSONB       NOT NULL,
  device_hint  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON public.user_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_school_id
  ON public.user_subscriptions (school_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_school_user
  ON public.user_subscriptions (school_id, user_id);

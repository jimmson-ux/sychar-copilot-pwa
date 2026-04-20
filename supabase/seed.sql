-- ============================================================
-- Sychar Copilot — Database Seed
-- Safe to re-run: every INSERT uses ON CONFLICT DO NOTHING.
-- Fixed UUIDs used for all cross-referenced rows.
--
-- Tables seeded:
--    1. global_settings
--    2. schools
--    3. vote_heads            (School A, year 2026)
--    4. employees             (School A, 3 staff)
--    5. students              (School A, 5 students)
--    6. fee_balances          (School A, 5 students)
--    7. lpos                  (School A, 1 LPO — wrapped in DO block:
--                              requires a user in public.users)
--    8. imprest_advances      (School A, 1 advance — same requirement)
--    9. pocket_money_balances (School A, 5 students)
--   10. bread_vouchers        (School A, 5 vouchers dated 2026-04-16)
--   11. staff_attendance      (School A, 3 employees × 3 days)
--   12. system_logs           (12 entries across all 3 schools)
--
-- UUID notes:
--   School A   : a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1
--   School B   : b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2
--   School C   : c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3
--   Employees  : e1000001-…  e2000002-…  e3000003-…
--   Students   : 51000001-…  52000002-…  53000003-…  54000004-…  55000005-…
--     (spec used 's' prefix which is not valid hex; replaced with '5')
-- ============================================================


-- ============================================================
-- SEED 1 — global_settings
-- Already has a seed INSERT in migration 001 but the addon_pricing
-- JSONB may differ from production. This upsert-avoids overwriting.
-- ============================================================

INSERT INTO public.global_settings (
  id,
  addon_pricing
) VALUES (
  1,
  '{
    "gate_pass":        15000,
    "visitor_log":      6000,
    "staff_attendance": 10000,
    "pocket_money":     8000,
    "bread_voucher":    8000
  }'::jsonb
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 2 — schools
-- Three schools used for cross-school analytics and RLS testing.
-- School C is inactive (subscription lapsed) — used to verify
-- the /suspended redirect in middleware.
-- ============================================================

-- School A: Nkoroi Mixed Secondary — all add-ons enabled
INSERT INTO public.schools (
  id,
  name,
  county,
  sub_county,
  knec_code,
  student_count,
  features,
  is_active,
  subscription_expires_at
) VALUES (
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Nkoroi Mixed Secondary',
  'Kajiado',
  'Ngong',
  '10234001',
  1200,
  '{
    "gate_pass":        true,
    "visitor_log":      true,
    "staff_attendance": true,
    "pocket_money":     true,
    "bread_voucher":    true
  }'::jsonb,
  true,
  '2027-01-15 00:00:00+03'
) ON CONFLICT DO NOTHING;

-- School B: Kitengela High School — gate_pass + staff_attendance only
INSERT INTO public.schools (
  id,
  name,
  county,
  sub_county,
  knec_code,
  student_count,
  features,
  is_active,
  subscription_expires_at
) VALUES (
  'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
  'Kitengela High School',
  'Kajiado',
  'Kitengela',
  '10234002',
  850,
  '{
    "gate_pass":        true,
    "visitor_log":      false,
    "staff_attendance": true,
    "pocket_money":     false,
    "bread_voucher":    false
  }'::jsonb,
  true,
  '2026-12-01 00:00:00+03'
) ON CONFLICT DO NOTHING;

-- School C: Tharaka Secondary — inactive, expired, gate_pass only
INSERT INTO public.schools (
  id,
  name,
  county,
  sub_county,
  knec_code,
  student_count,
  features,
  is_active,
  subscription_expires_at
) VALUES (
  'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
  'Tharaka Secondary School',
  'Tharaka Nithi',
  'Chuka',
  '22001003',
  620,
  '{
    "gate_pass":        true,
    "visitor_log":      false,
    "staff_attendance": false,
    "pocket_money":     false,
    "bread_voucher":    false
  }'::jsonb,
  false,
  '2026-03-01 00:00:00+03'
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 3 — vote_heads  (School A, year 2026)
-- UNIQUE on (school_id, code, year) — ON CONFLICT DO NOTHING
-- covers re-runs safely.
-- ============================================================

INSERT INTO public.vote_heads (
  id,
  school_id,
  code,
  name,
  category,
  annual_budget,
  year
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'OP-PE',
  'Personal Emoluments',
  'Operations',
  4500000.00,
  2026
) ON CONFLICT DO NOTHING;

INSERT INTO public.vote_heads (
  id,
  school_id,
  code,
  name,
  category,
  annual_budget,
  year
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'OP-RMI',
  'Repairs Maintenance & Improvement',
  'Operations',
  800000.00,
  2026
) ON CONFLICT DO NOTHING;

INSERT INTO public.vote_heads (
  id,
  school_id,
  code,
  name,
  category,
  annual_budget,
  year
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'OP-EWC',
  'Electricity Water & Conservancy',
  'Operations',
  350000.00,
  2026
) ON CONFLICT DO NOTHING;

INSERT INTO public.vote_heads (
  id,
  school_id,
  code,
  name,
  category,
  annual_budget,
  year
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'TU-LB',
  'Library & Reference Materials',
  'Tuition',
  200000.00,
  2026
) ON CONFLICT DO NOTHING;

INSERT INTO public.vote_heads (
  id,
  school_id,
  code,
  name,
  category,
  annual_budget,
  year
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'TU-EXM',
  'Internal Examinations',
  'Tuition',
  450000.00,
  2026
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 4 — employees  (School A)
-- user_id omitted — employees may exist without a Supabase Auth
-- account (e.g. staff added manually before onboarding).
-- Fixed UUIDs so staff_attendance cross-references work.
-- ============================================================

INSERT INTO public.employees (
  id,
  school_id,
  full_name,
  tsc_number,
  kra_pin,
  gross_salary,
  job_title,
  department,
  is_active
) VALUES (
  'e1000001-0001-0001-0001-e10000010001',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Wanjiku Kamau',
  'TSC/045231/01',
  'A012345678P',
  87500.00,
  'Senior Teacher Mathematics',
  'Teaching',
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.employees (
  id,
  school_id,
  full_name,
  tsc_number,
  kra_pin,
  gross_salary,
  job_title,
  department,
  is_active
) VALUES (
  'e2000002-0002-0002-0002-e20000020002',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Ochieng Otieno',
  'TSC/067892/02',
  'A023456789Q',
  64000.00,
  'Teacher English',
  'Teaching',
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.employees (
  id,
  school_id,
  full_name,
  tsc_number,
  kra_pin,
  gross_salary,
  job_title,
  department,
  is_active
) VALUES (
  'e3000003-0003-0003-0003-e30000030003',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Akinyi Njoroge',
  'TSC/089123/03',
  'A034567890R',
  43500.00,
  'Laboratory Technician',
  'Non-Teaching',
  true
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 5 — students  (School A)
-- The students table has school_id + admission_number from the
-- original schema; nemis_upi, form, stream were added in
-- migration 001. Fixed UUIDs used for downstream seeds.
-- ============================================================

INSERT INTO public.students (
  id,
  school_id,
  full_name,
  admission_number,
  nemis_upi,
  form,
  stream
) VALUES (
  '51000001-0001-0001-0001-510000010001',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Brian Mwangi Kariuki',
  'NMS/2019/001',
  '2019NBI04567',
  4,
  'East'
) ON CONFLICT DO NOTHING;

INSERT INTO public.students (
  id,
  school_id,
  full_name,
  admission_number,
  nemis_upi,
  form,
  stream
) VALUES (
  '52000002-0002-0002-0002-520000020002',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Faith Wambui Gitau',
  'NMS/2019/002',
  '2019NBI04891',
  4,
  'West'
) ON CONFLICT DO NOTHING;

INSERT INTO public.students (
  id,
  school_id,
  full_name,
  admission_number,
  nemis_upi,
  form,
  stream
) VALUES (
  '53000003-0003-0003-0003-530000030003',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Kevin Omondi Aloo',
  'NMS/2020/001',
  '2020NBI05123',
  3,
  'East'
) ON CONFLICT DO NOTHING;

INSERT INTO public.students (
  id,
  school_id,
  full_name,
  admission_number,
  nemis_upi,
  form,
  stream
) VALUES (
  '54000004-0004-0004-0004-540000040004',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Grace Chebet Rono',
  'NMS/2020/002',
  '2020NBI05456',
  3,
  'North'
) ON CONFLICT DO NOTHING;

INSERT INTO public.students (
  id,
  school_id,
  full_name,
  admission_number,
  nemis_upi,
  form,
  stream
) VALUES (
  '55000005-0005-0005-0005-550000050005',
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'Dennis Murithi Njeru',
  'NMS/2021/001',
  '2021NBI06012',
  2,
  'West'
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 6 — fee_balances  (School A)
-- current_balance is GENERATED (invoiced - paid); do not insert.
-- UNIQUE on student_id — ON CONFLICT DO NOTHING is correct.
-- ============================================================

-- Brian: fully paid
INSERT INTO public.fee_balances (
  id,
  school_id,
  student_id,
  invoiced_amount,
  paid_amount
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '51000001-0001-0001-0001-510000010001',
  15000.00,
  15000.00
) ON CONFLICT DO NOTHING;

-- Faith: fully paid
INSERT INTO public.fee_balances (
  id,
  school_id,
  student_id,
  invoiced_amount,
  paid_amount
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '52000002-0002-0002-0002-520000020002',
  15000.00,
  15000.00
) ON CONFLICT DO NOTHING;

-- Kevin: partial payment (balance = 7000)
INSERT INTO public.fee_balances (
  id,
  school_id,
  student_id,
  invoiced_amount,
  paid_amount
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '53000003-0003-0003-0003-530000030003',
  15000.00,
  8000.00
) ON CONFLICT DO NOTHING;

-- Grace: large balance (11500 outstanding)
INSERT INTO public.fee_balances (
  id,
  school_id,
  student_id,
  invoiced_amount,
  paid_amount
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '54000004-0004-0004-0004-540000040004',
  15000.00,
  3500.00
) ON CONFLICT DO NOTHING;

-- Dennis: no payment made (full balance outstanding)
INSERT INTO public.fee_balances (
  id,
  school_id,
  student_id,
  invoiced_amount,
  paid_amount
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '55000005-0005-0005-0005-550000050005',
  12000.00,
  0.00
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 7 — LPO  (School A)
-- lpos.aie_user_id is NOT NULL REFERENCES public.users(id).
-- Wrapped in a DO block: uses the first user found for School A.
-- If no user exists yet, a NOTICE is raised and the seed is
-- skipped — run again after creating the principal account.
-- vote_head_id resolved by subquery on (code, school_id, year).
-- ============================================================

DO $$
DECLARE
  v_aie_user_id  UUID;
  v_vote_head_id UUID;
BEGIN
  SELECT id
  INTO   v_aie_user_id
  FROM   public.users
  WHERE  school_id = 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1'
  LIMIT  1;

  IF v_aie_user_id IS NULL THEN
    RAISE NOTICE
      'SEED 7 — LPO skipped: no user found for School A. '
      'Create a principal / bursar account first, then re-run this seed.';
  ELSE
    SELECT id
    INTO   v_vote_head_id
    FROM   public.vote_heads
    WHERE  code      = 'OP-RMI'
      AND  school_id = 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1'
      AND  year      = 2026;

    INSERT INTO public.lpos (
      id,
      school_id,
      vote_head_id,
      aie_user_id,
      vendor_name,
      description,
      authorized_amount,
      status
    ) VALUES (
      gen_random_uuid(),
      'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
      v_vote_head_id,
      v_aie_user_id,
      'QuickFix Motors Ltd',
      'School bus engine overhaul and brake system repair',
      45000.00,
      'Pending'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'SEED 7 — LPO inserted for School A (OP-RMI, QuickFix Motors Ltd).';
  END IF;
END $$;


-- ============================================================
-- SEED 8 — imprest_advance  (School A)
-- Same DO-block pattern as the LPO seed above.
-- voucher_number is UNIQUE — ON CONFLICT DO NOTHING is safe.
-- ============================================================

DO $$
DECLARE
  v_aie_user_id UUID;
BEGIN
  SELECT id
  INTO   v_aie_user_id
  FROM   public.users
  WHERE  school_id = 'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1'
  LIMIT  1;

  IF v_aie_user_id IS NULL THEN
    RAISE NOTICE
      'SEED 8 — imprest_advance skipped: no user found for School A. '
      'Create a principal / bursar account first, then re-run this seed.';
  ELSE
    INSERT INTO public.imprest_advances (
      id,
      school_id,
      aie_user_id,
      reason,
      amount_issued,
      amount_surrendered,
      status,
      voucher_number
    ) VALUES (
      gen_random_uuid(),
      'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
      v_aie_user_id,
      'Drama Club Transport Nairobi Schools Festival 2026',
      20000.00,
      0.00,
      'Open',
      'IMP-2026-001'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'SEED 8 — imprest_advance IMP-2026-001 inserted for School A.';
  END IF;
END $$;


-- ============================================================
-- SEED 9 — pocket_money_balances  (School A)
-- UNIQUE on student_id — ON CONFLICT DO NOTHING prevents dupes.
-- ============================================================

-- Brian: active spender, half balance remaining
INSERT INTO public.pocket_money_balances (
  id,
  school_id,
  student_id,
  current_balance,
  total_topped_up
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '51000001-0001-0001-0001-510000010001',
  1500.00,
  3000.00
) ON CONFLICT DO NOTHING;

-- Faith: light spender
INSERT INTO public.pocket_money_balances (
  id,
  school_id,
  student_id,
  current_balance,
  total_topped_up
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '52000002-0002-0002-0002-520000020002',
  800.00,
  2000.00
) ON CONFLICT DO NOTHING;

-- Kevin: fully spent
INSERT INTO public.pocket_money_balances (
  id,
  school_id,
  student_id,
  current_balance,
  total_topped_up
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '53000003-0003-0003-0003-530000030003',
  0.00,
  500.00
) ON CONFLICT DO NOTHING;

-- Grace: recently topped up, no spend yet
INSERT INTO public.pocket_money_balances (
  id,
  school_id,
  student_id,
  current_balance,
  total_topped_up
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '54000004-0004-0004-0004-540000040004',
  2200.00,
  2200.00
) ON CONFLICT DO NOTHING;

-- Dennis: small balance
INSERT INTO public.pocket_money_balances (
  id,
  school_id,
  student_id,
  current_balance,
  total_topped_up
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '55000005-0005-0005-0005-550000050005',
  350.00,
  1000.00
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 10 — bread_vouchers  (School A, dated 2026-04-16)
-- total_cost is GENERATED ALWAYS (quantity * unit_cost) — omit.
-- One voucher per student, quantity 1, unit_cost 50, unredeemed.
-- ============================================================

INSERT INTO public.bread_vouchers (
  id,
  school_id,
  student_id,
  voucher_date,
  quantity,
  unit_cost,
  redeemed
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '51000001-0001-0001-0001-510000010001',
  '2026-04-16',
  1,
  50.00,
  false
) ON CONFLICT DO NOTHING;

INSERT INTO public.bread_vouchers (
  id,
  school_id,
  student_id,
  voucher_date,
  quantity,
  unit_cost,
  redeemed
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '52000002-0002-0002-0002-520000020002',
  '2026-04-16',
  1,
  50.00,
  false
) ON CONFLICT DO NOTHING;

INSERT INTO public.bread_vouchers (
  id,
  school_id,
  student_id,
  voucher_date,
  quantity,
  unit_cost,
  redeemed
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '53000003-0003-0003-0003-530000030003',
  '2026-04-16',
  1,
  50.00,
  false
) ON CONFLICT DO NOTHING;

INSERT INTO public.bread_vouchers (
  id,
  school_id,
  student_id,
  voucher_date,
  quantity,
  unit_cost,
  redeemed
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '54000004-0004-0004-0004-540000040004',
  '2026-04-16',
  1,
  50.00,
  false
) ON CONFLICT DO NOTHING;

INSERT INTO public.bread_vouchers (
  id,
  school_id,
  student_id,
  voucher_date,
  quantity,
  unit_cost,
  redeemed
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  '55000005-0005-0005-0005-550000050005',
  '2026-04-16',
  1,
  50.00,
  false
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 11 — staff_attendance  (School A, 3 employees × 3 days)
-- UNIQUE on (school_id, employee_id, date) — safe to re-run.
-- check_in_at is TIMESTAMPTZ; times in EAT (UTC+3).
-- department mirrors the employee's department for direct queries.
-- ============================================================

-- ── 2026-04-14 ───────────────────────────────────────────────

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e1000001-0001-0001-0001-e10000010001',
  '2026-04-14',
  '2026-04-14 07:15:00+03',
  'Present',
  'Teaching'
) ON CONFLICT DO NOTHING;

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e2000002-0002-0002-0002-e20000020002',
  '2026-04-14',
  '2026-04-14 07:22:00+03',
  'Present',
  'Teaching'
) ON CONFLICT DO NOTHING;

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e3000003-0003-0003-0003-e30000030003',
  '2026-04-14',
  '2026-04-14 07:45:00+03',
  'Present',
  'Non-Teaching'
) ON CONFLICT DO NOTHING;

-- ── 2026-04-15 ───────────────────────────────────────────────

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e1000001-0001-0001-0001-e10000010001',
  '2026-04-15',
  '2026-04-15 07:18:00+03',
  'Present',
  'Teaching'
) ON CONFLICT DO NOTHING;

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e2000002-0002-0002-0002-e20000020002',
  '2026-04-15',
  '2026-04-15 07:25:00+03',
  'Present',
  'Teaching'
) ON CONFLICT DO NOTHING;

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e3000003-0003-0003-0003-e30000030003',
  '2026-04-15',
  '2026-04-15 07:42:00+03',
  'Present',
  'Non-Teaching'
) ON CONFLICT DO NOTHING;

-- ── 2026-04-16 ───────────────────────────────────────────────

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e1000001-0001-0001-0001-e10000010001',
  '2026-04-16',
  '2026-04-16 07:20:00+03',
  'Present',
  'Teaching'
) ON CONFLICT DO NOTHING;

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e2000002-0002-0002-0002-e20000020002',
  '2026-04-16',
  '2026-04-16 07:22:00+03',
  'Present',
  'Teaching'
) ON CONFLICT DO NOTHING;

INSERT INTO public.staff_attendance (
  id,
  school_id,
  employee_id,
  date,
  check_in_at,
  status,
  department
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'e3000003-0003-0003-0003-e30000030003',
  '2026-04-16',
  '2026-04-16 07:50:00+03',
  'Present',
  'Non-Teaching'
) ON CONFLICT DO NOTHING;


-- ============================================================
-- SEED 12 — system_logs  (12 entries across all 3 schools)
-- school_id is nullable (ON DELETE SET NULL in migration).
-- level   uses enum: info | warning | error | critical
-- category uses enum: api | offline_sync | network_latency |
--                     auth | database
-- Timestamps spread across last 5 days (2026-04-11 → 2026-04-16).
-- ============================================================

-- ── 4 × info (category: api) ─────────────────────────────────

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'info',
  'api',
  'GET /api/fee-balances completed successfully',
  '{"latency_ms": 45, "status": 200, "records_returned": 47}'::jsonb,
  '2026-04-11 09:23:14+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
  'info',
  'api',
  'POST /api/gate completed successfully',
  '{"latency_ms": 88, "status": 201, "student_id": "redacted"}'::jsonb,
  '2026-04-12 11:45:30+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'info',
  'api',
  'GET /api/analytics/principal/school-mean completed successfully',
  '{"latency_ms": 130, "status": 200, "served_from_cache": true}'::jsonb,
  '2026-04-13 14:02:55+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
  'info',
  'api',
  'GET /api/school-stats completed successfully',
  '{"latency_ms": 62, "status": 200, "records_returned": 12}'::jsonb,
  '2026-04-16 08:31:07+03'
) ON CONFLICT DO NOTHING;

-- ── 3 × warning (category: network_latency) ──────────────────

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
  'warning',
  'network_latency',
  'High latency detected on GET /api/teacher-profile',
  '{"latency_ms": 2200, "threshold_ms": 2000, "userAgent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36"}'::jsonb,
  '2026-04-11 17:55:41+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'warning',
  'network_latency',
  'High latency detected on POST /api/welfare/log',
  '{"latency_ms": 3100, "threshold_ms": 2000, "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}'::jsonb,
  '2026-04-13 08:14:22+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'c3c3c3c3-0003-0003-0003-c3c3c3c3c3c3',
  'warning',
  'network_latency',
  'High latency detected on GET /api/pathways',
  '{"latency_ms": 3900, "threshold_ms": 2000, "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}'::jsonb,
  '2026-04-15 19:22:09+03'
) ON CONFLICT DO NOTHING;

-- ── 3 × error (category: api) ────────────────────────────────

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'error',
  'api',
  'POST /api/gate-pass failed: student not found',
  '{"status": 404, "endpoint": "/api/gate-pass", "error": "No student matching provided admission_number"}'::jsonb,
  '2026-04-14 10:33:17+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
  'error',
  'api',
  'POST /api/payments failed: M-Pesa callback timeout',
  '{"status": 502, "endpoint": "/api/payments", "error": "Upstream M-Pesa STK push confirmation timed out after 30s"}'::jsonb,
  '2026-04-15 16:44:58+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'error',
  'api',
  'GET /api/fee-collection failed: RLS policy violation',
  '{"status": 403, "endpoint": "/api/fee-collection", "error": "Row-level security blocked access — role mismatch"}'::jsonb,
  '2026-04-16 07:58:44+03'
) ON CONFLICT DO NOTHING;

-- ── 2 × critical (category: database) ───────────────────────

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'a1a1a1a1-0001-0001-0001-a1a1a1a1a1a1',
  'critical',
  'database',
  'Connection pool exhausted — Supabase connection limit reached',
  '{"error": "remaining_connections: 0", "pool_size": 60, "active_connections": 60, "queued_requests": 14, "hint": "Consider upgrading Supabase plan or reducing connection concurrency"}'::jsonb,
  '2026-04-14 23:01:33+03'
) ON CONFLICT DO NOTHING;

INSERT INTO public.system_logs (
  id,
  school_id,
  level,
  category,
  message,
  payload,
  created_at
) VALUES (
  gen_random_uuid(),
  'b2b2b2b2-0002-0002-0002-b2b2b2b2b2b2',
  'critical',
  'database',
  'Unhandled foreign key violation on fee_transactions INSERT',
  '{"error": "insert or update on table \"fee_transactions\" violates foreign key constraint \"fee_transactions_student_id_fkey\"", "detail": "Key (student_id)=(00000000-0000-0000-0000-000000000000) is not present in table \"students\"", "table": "fee_transactions"}'::jsonb,
  '2026-04-15 03:12:05+03'
) ON CONFLICT DO NOTHING;

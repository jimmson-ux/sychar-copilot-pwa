-- Sychar Copilot 2026 Kenya Tax Engine
-- NSSF Year 4 (Feb 2026): upper limit KES 108,000, max contribution KES 6,480
-- SHIF: 2.75% of gross, minimum KES 300, no cap
-- AHL: 1.5% of gross, no cap
-- SHIF and Housing Levy are allowable deductions before PAYE (2026 rule)
-- Personal relief: KES 2,400/month
-- Insurance relief: 15% of SHIF contribution
-- Update this file when KRA revises tax bands

-- ============================================================
-- FUNCTION 1: calculate_kenya_payroll_2026
-- Pure statutory deduction calculator — school-agnostic.
-- Safe to call from reports, payslips, or LATERAL joins.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_kenya_payroll_2026(
  gross_pay NUMERIC
)
RETURNS TABLE (
  nssf                NUMERIC,
  shif                NUMERIC,
  housing_levy        NUMERIC,
  taxable_pay         NUMERIC,
  paye_before_relief  NUMERIC,
  personal_relief     NUMERIC,
  insurance_relief    NUMERIC,
  final_paye          NUMERIC,
  net_pay             NUMERIC
)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_nssf               NUMERIC;
  v_shif               NUMERIC;
  v_housing_levy       NUMERIC;
  v_taxable_pay        NUMERIC;
  v_paye_before_relief NUMERIC;
  v_personal_relief    NUMERIC;
  v_insurance_relief   NUMERIC;
  v_final_paye         NUMERIC;
  v_net_pay            NUMERIC;
BEGIN
  -- ── Statutory deductions ─────────────────────────────────
  v_nssf         := LEAST(gross_pay, 108000) * 0.06;
  v_shif         := GREATEST(300, gross_pay * 0.0275);
  v_housing_levy := gross_pay * 0.015;

  -- ── Taxable pay: SHIF and AHL are allowable deductions ───
  v_taxable_pay := gross_pay - v_nssf - v_shif - v_housing_levy;

  -- ── PAYE bands (2026 KRA schedule) ───────────────────────
  v_paye_before_relief := 0;

  IF v_taxable_pay <= 0 THEN
    v_paye_before_relief := 0;

  ELSIF v_taxable_pay <= 24000 THEN
    -- Band 1: 10% on 0 – 24,000
    v_paye_before_relief := v_taxable_pay * 0.10;

  ELSIF v_taxable_pay <= 32333 THEN
    -- Band 1 + Band 2: 25% on 24,001 – 32,333
    v_paye_before_relief :=
        (24000 * 0.10)
      + ((v_taxable_pay - 24000) * 0.25);

  ELSIF v_taxable_pay <= 500000 THEN
    -- Bands 1–3: 30% on 32,334 – 500,000
    v_paye_before_relief :=
        (24000            * 0.10)
      + ((32333 - 24000)  * 0.25)
      + ((v_taxable_pay - 32333) * 0.30);

  ELSIF v_taxable_pay <= 800000 THEN
    -- Bands 1–4: 32.5% on 500,001 – 800,000
    v_paye_before_relief :=
        (24000            * 0.10)
      + ((32333 - 24000)  * 0.25)
      + ((500000 - 32333) * 0.30)
      + ((v_taxable_pay - 500000) * 0.325);

  ELSE
    -- Band 5: 35% above 800,000
    v_paye_before_relief :=
        (24000            * 0.10)
      + ((32333 - 24000)  * 0.25)
      + ((500000 - 32333) * 0.30)
      + ((800000 - 500000) * 0.325)
      + ((v_taxable_pay - 800000) * 0.35);

  END IF;

  -- ── Reliefs ──────────────────────────────────────────────
  v_personal_relief  := 2400;
  v_insurance_relief := v_shif * 0.15;

  -- ── Final PAYE (floor at zero) ───────────────────────────
  v_final_paye := GREATEST(
    0,
    v_paye_before_relief - v_personal_relief - v_insurance_relief
  );

  -- ── Net pay ──────────────────────────────────────────────
  v_net_pay := gross_pay - v_nssf - v_shif - v_housing_levy - v_final_paye;

  -- ── Return single row ────────────────────────────────────
  RETURN QUERY SELECT
    ROUND(v_nssf,               2),
    ROUND(v_shif,               2),
    ROUND(v_housing_levy,       2),
    ROUND(v_taxable_pay,        2),
    ROUND(v_paye_before_relief, 2),
    ROUND(v_personal_relief,    2),
    ROUND(v_insurance_relief,   2),
    ROUND(v_final_paye,         2),
    ROUND(v_net_pay,            2);
END;
$$;

COMMENT ON FUNCTION public.calculate_kenya_payroll_2026(NUMERIC) IS
  'Returns full statutory breakdown for a single gross pay figure. '
  'Uses 2026 NSSF Year-4 ceiling, SHIF 2.75% (min 300), AHL 1.5%, '
  'PAYE 5-band schedule. Safe for LATERAL joins.';


-- ============================================================
-- FUNCTION 2: get_payroll_summary
-- Full payroll run for a school — one row per active employee.
-- Includes employer-side costs for BOM/management reporting.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_payroll_summary(
  p_school_id UUID,
  p_month     INTEGER,
  p_year      INTEGER
)
RETURNS TABLE (
  employee_id            UUID,
  full_name              TEXT,
  department             TEXT,
  gross_salary           NUMERIC,
  nssf                   NUMERIC,
  shif                   NUMERIC,
  housing_levy           NUMERIC,
  paye                   NUMERIC,
  net_salary             NUMERIC,
  employer_nssf          NUMERIC,
  employer_housing_levy  NUMERIC,
  total_cost_to_school   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- p_month and p_year are accepted for audit/payslip labelling;
  -- the function derives statutory figures from e.gross_salary which
  -- represents the current contracted amount.
  RETURN QUERY
  SELECT
    e.id                                         AS employee_id,
    e.full_name,
    e.department,
    e.gross_salary,
    p.nssf,
    p.shif,
    p.housing_levy,
    p.final_paye                                 AS paye,
    p.net_pay                                    AS net_salary,
    -- Employer matching contributions
    p.nssf                                       AS employer_nssf,
    ROUND(e.gross_salary * 0.015, 2)             AS employer_housing_levy,
    ROUND(
      e.gross_salary
      + p.nssf
      + (e.gross_salary * 0.015),
      2
    )                                            AS total_cost_to_school
  FROM public.employees e
  CROSS JOIN LATERAL public.calculate_kenya_payroll_2026(e.gross_salary) p
  WHERE e.school_id  = p_school_id
    AND e.is_active  = true
  ORDER BY e.department, e.full_name;
END;
$$;

COMMENT ON FUNCTION public.get_payroll_summary(UUID, INTEGER, INTEGER) IS
  'Returns one row per active employee in the school with full statutory '
  'deductions (employee + employer side). p_month and p_year are for '
  'labelling only — gross_salary is the live contracted amount.';


-- ============================================================
-- FUNCTION 3: get_ghost_worker_suspects
-- Flags active employees with no recent "Present" attendance.
-- Intended for internal audit use by the principal/bursar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_ghost_worker_suspects(
  p_school_id UUID,
  p_days      INTEGER DEFAULT 30
)
RETURNS TABLE (
  employee_id         UUID,
  full_name           TEXT,
  department          TEXT,
  gross_salary        NUMERIC,
  last_attendance_date DATE,
  days_absent         INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id                                         AS employee_id,
    e.full_name,
    e.department,
    e.gross_salary,
    MAX(sa.attendance_date)                      AS last_attendance_date,
    -- If no attendance record exists, days_absent = p_days + 1 (sentinel)
    COALESCE(
      EXTRACT(DAY FROM NOW() - MAX(sa.attendance_date))::INTEGER,
      p_days + 1
    )                                            AS days_absent
  FROM public.employees e
  LEFT JOIN public.staff_attendance sa
    ON  sa.employee_id    = e.id
    AND sa.status         = 'Present'
  WHERE e.school_id  = p_school_id
    AND e.is_active  = true
  GROUP BY e.id, e.full_name, e.department, e.gross_salary
  HAVING
    -- No present record at all, OR last present > p_days ago
    MAX(sa.attendance_date) IS NULL
    OR MAX(sa.attendance_date) < (CURRENT_DATE - p_days)
  ORDER BY days_absent DESC NULLS FIRST, e.full_name;
END;
$$;

COMMENT ON FUNCTION public.get_ghost_worker_suspects(UUID, INTEGER) IS
  'Returns active employees whose last "Present" staff_attendance record '
  'is older than p_days (default 30) days, or who have no attendance at all. '
  'Used for ghost-worker audit reports.';


-- ============================================================
-- VIEW: school_payroll_overview
-- Convenience view — one row per active employee across all
-- schools. Scope to a school with WHERE school_id = '...'.
-- ============================================================

CREATE OR REPLACE VIEW public.school_payroll_overview AS
SELECT
  e.school_id,
  e.id         AS employee_id,
  e.full_name,
  e.department,
  e.gross_salary,
  p.nssf,
  p.shif,
  p.housing_levy,
  p.taxable_pay,
  p.paye_before_relief,
  p.personal_relief,
  p.insurance_relief,
  p.final_paye,
  p.net_pay
FROM public.employees e
CROSS JOIN LATERAL public.calculate_kenya_payroll_2026(e.gross_salary) p
WHERE e.is_active = true;

COMMENT ON VIEW public.school_payroll_overview IS
  'Live payroll breakdown for all active employees. '
  'Filter by school_id to scope to a single school. '
  'No caching — always reflects current gross_salary values.';

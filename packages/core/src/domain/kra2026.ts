// Kenya 2026 statutory deductions engine.
// Mirrors the SQL function calculate_kenya_payroll_2026 in migration 003_tax_engine_2026.sql.
// Use this for the TypeScript layer (API routes, payslip generation).

export function calculatePAYE(gross: number): number {
  // 2026 KRA bands (monthly)
  const bands = [
    { limit: 24000,   rate: 0.10 },
    { limit: 8333,    rate: 0.25 },
    { limit: 467667,  rate: 0.30 },
    { limit: Infinity, rate: 0.35 },
  ]
  let tax = 0
  let remaining = gross
  for (const band of bands) {
    if (remaining <= 0) break
    const taxable = Math.min(remaining, band.limit)
    tax += taxable * band.rate
    remaining -= taxable
  }
  return Math.max(0, Math.round(tax - 2400)) // personal relief KES 2,400
}

// NSSF Year 4 (2026): Tier I 6% up to 7,000 + Tier II 6% on 7,001–36,000
export function calculateNSSF(gross: number): number {
  const TIER_I  = 7000
  const TIER_II = 36000
  const RATE    = 0.06
  const t1 = Math.min(gross, TIER_I) * RATE
  const t2 = Math.max(0, Math.min(gross, TIER_II) - TIER_I) * RATE
  return Math.round(t1 + t2)
}

// SHIF — Social Health Insurance Fund (2.75% of gross)
export function calculateSHIF(gross: number): number {
  return Math.round(gross * 0.0275)
}

// AHL — Affordable Housing Levy (1.5% of gross)
export function calculateAHL(gross: number): number {
  return Math.round(gross * 0.015)
}

export interface PayrollBreakdown {
  gross: number
  paye: number
  nssf: number
  shif: number
  ahl: number
  totalDeductions: number
  net: number
}

export function calculateNetPay(gross: number): PayrollBreakdown {
  const paye = calculatePAYE(gross)
  const nssf = calculateNSSF(gross)
  const shif = calculateSHIF(gross)
  const ahl  = calculateAHL(gross)
  const totalDeductions = paye + nssf + shif + ahl
  return { gross, paye, nssf, shif, ahl, totalDeductions, net: gross - totalDeductions }
}

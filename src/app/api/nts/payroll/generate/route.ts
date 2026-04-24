// POST /api/nts/payroll/generate
// Generates monthly payroll for NTS (non-teaching staff) based on days worked.
// Principal and deputy_admin only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { calculateNetPay } from '@/lib/kra2026'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['principal', 'deputy_admin', 'deputy_principal'])

type NTSStaff = {
  id: string
  full_name: string
  department: string | null
  daily_rate: number | null
  employment_type: string | null
  kra_pin: string | null
  bank_account: string | null
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: principal or deputy admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    month: string       // 'YYYY-MM' e.g. '2026-04'
    staffIds?: string[] // optional: subset of NTS staff
  } | null

  if (!body?.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'month required in YYYY-MM format (e.g. 2026-04)' }, { status: 400 })
  }

  const [yearStr, monthStr] = body.month.split('-')
  const year  = Number(yearStr)
  const month = Number(monthStr)

  const db = svc()

  // Fetch NTS staff
  let staffQuery = db
    .from('staff_records')
    .select('id, full_name, department, daily_rate, employment_type, kra_pin, bank_account')
    .eq('school_id', auth.schoolId!)
    .eq('employment_type', 'NTS')
    .eq('is_active', true)

  if (body.staffIds?.length) {
    staffQuery = staffQuery.in('id', body.staffIds)
  }

  const { data: staff, error: staffErr } = await staffQuery
  if (staffErr) {
    console.error('[nts/payroll/generate] staff fetch:', staffErr.message)
    return NextResponse.json({ error: 'Failed to fetch NTS staff' }, { status: 500 })
  }

  const ntsStaff = (staff ?? []) as NTSStaff[]
  if (!ntsStaff.length) {
    return NextResponse.json({ error: 'No active NTS staff found for this school' }, { status: 404 })
  }

  const breakdown: Array<{
    staffId: string
    fullName: string
    department: string | null
    daysWorked: number
    dailyRate: number
    gross: number
    paye: number
    nssf: number
    shif: number
    ahl: number
    totalDeductions: number
    net: number
  }> = []

  for (const s of ntsStaff) {
    const dailyRate = s.daily_rate ?? 0

    // Count distinct days present from nts_attendance_log
    const { count: daysWorked } = await db
      .from('nts_attendance_log')
      .select('date', { count: 'exact', head: false })
      .eq('school_id', auth.schoolId!)
      .eq('staff_id', s.id)
      .eq('status', 'IN')
      .gte('date', `${body.month}-01`)
      .lte('date', `${body.month}-31`)

    const days = daysWorked ?? 0
    const gross = Math.round(days * dailyRate * 100) / 100
    const pay   = calculateNetPay(gross)

    // UPSERT payroll record
    await db.from('nts_payroll').upsert({
      school_id:        auth.schoolId,
      staff_id:         s.id,
      month:            String(month),
      year:             String(year),
      days_worked:      days,
      daily_rate:       dailyRate,
      gross:            pay.gross,
      paye:             pay.paye,
      nssf:             pay.nssf,
      shif:             pay.shif,
      ahl:              pay.ahl,
      total_deductions: pay.totalDeductions,
      net:              pay.net,
      status:           'draft',
      generated_at:     new Date().toISOString(),
    }, { onConflict: 'school_id,staff_id,month,year' })

    breakdown.push({
      staffId:         s.id,
      fullName:        s.full_name,
      department:      s.department,
      daysWorked:      days,
      dailyRate,
      ...pay,
    })
  }

  const totals = breakdown.reduce(
    (acc, r) => ({
      totalGross: acc.totalGross + r.gross,
      totalNet:   acc.totalNet   + r.net,
      totalPAYE:  acc.totalPAYE  + r.paye,
      totalNSSF:  acc.totalNSSF  + r.nssf,
      totalSHIF:  acc.totalSHIF  + r.shif,
      totalAHL:   acc.totalAHL   + r.ahl,
    }),
    { totalGross: 0, totalNet: 0, totalPAYE: 0, totalNSSF: 0, totalSHIF: 0, totalAHL: 0 }
  )

  return NextResponse.json({
    ok:         true,
    month:      body.month,
    totalStaff: breakdown.length,
    ...totals,
    breakdown,
  })
}

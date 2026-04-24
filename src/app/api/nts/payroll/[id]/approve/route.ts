// PATCH /api/nts/payroll/[id]/approve
// Principal ONLY — approves a draft NTS payroll record.
// Generates a BOM wage report PDF via the generate-pdf edge function.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type PayrollRow = {
  id: string
  staff_id: string
  month: string
  year: string
  days_worked: number
  daily_rate: number
  gross: number
  paye: number
  nssf: number
  shif: number
  ahl: number
  total_deductions: number
  net: number
  status: string
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const { id } = await params
  const db = svc()

  const { data: payroll, error: fetchErr } = await db
    .from('nts_payroll')
    .select('id, staff_id, month, year, days_worked, daily_rate, gross, paye, nssf, shif, ahl, total_deductions, net, status')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !payroll) {
    return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 })
  }

  const p = payroll as PayrollRow

  if (p.status === 'approved') {
    return NextResponse.json({ error: 'Payroll already approved' }, { status: 409 })
  }

  if (p.status !== 'draft') {
    return NextResponse.json({ error: `Cannot approve payroll with status '${p.status}'` }, { status: 409 })
  }

  const now = new Date().toISOString()

  // Fetch staff details
  const { data: staff } = await db
    .from('staff_records')
    .select('full_name, department, bank_account, kra_pin')
    .eq('id', p.staff_id)
    .single()

  type StaffRow = { full_name: string; department: string | null; bank_account: string | null; kra_pin: string | null }
  const s = staff as StaffRow | null

  // Fetch tenant info
  const { data: tenant } = await db
    .from('tenant_configs')
    .select('name')
    .eq('school_id', auth.schoolId!)
    .single()

  type TenantRow = { name: string }
  const t = tenant as TenantRow | null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  // Generate BOM wage report PDF
  let pdfUrl: string | null = null
  try {
    const edgeRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        docType: 'duty_roster',  // reusing closest template; UI labels it as wage report
        data: {
          schoolName:      t?.name ?? 'Secondary School',
          title:           'BOM WAGE REPORT — NTS PAYROLL',
          staffName:       s?.full_name ?? '—',
          department:      s?.department ?? '—',
          kraPin:          s?.kra_pin ?? '—',
          bankAccount:     s?.bank_account ?? '—',
          month:           `${p.month}/${p.year}`,
          daysWorked:      p.days_worked,
          dailyRate:       p.daily_rate,
          grossPay:        p.gross,
          paye:            p.paye,
          nssf:            p.nssf,
          shif:            p.shif,
          ahl:             p.ahl,
          totalDeductions: p.total_deductions,
          netPay:          p.net,
          approvedAt:      now,
        },
      }),
    })

    if (edgeRes.ok) {
      const edgeJson = await edgeRes.json() as { success: boolean; url?: string }
      pdfUrl = edgeJson.url ?? null
    } else {
      console.error('[nts/payroll/approve] edge function failed:', await edgeRes.text())
    }
  } catch (e) {
    console.error('[nts/payroll/approve] edge error:', e)
  }

  // Update payroll record
  const { error: updateErr } = await db.from('nts_payroll').update({
    status:      'approved',
    approved_by: auth.userId,
    approved_at: now,
    pdf_url:     pdfUrl,
  }).eq('id', id).eq('school_id', auth.schoolId!)

  if (updateErr) {
    console.error('[nts/payroll/approve] update error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to approve payroll' }, { status: 500 })
  }

  return NextResponse.json({ success: true, pdfUrl })
}

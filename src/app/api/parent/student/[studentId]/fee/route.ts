// GET /api/parent/student/[studentId]/fee
// Returns: fee_balances row + last 5 fee_records + school paybill

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const { studentId } = await params

  if (!parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  // fee_balances has no school_id column — filter only by student_id
  const [{ data: balance }, { data: payments }, { data: school }] = await Promise.all([
    svc
      .from('fee_balances')
      .select('total_billed, total_paid, balance_due, updated_at')
      .eq('student_id', studentId)
      .maybeSingle(),

    svc
      .from('fee_records')
      .select('amount_paid, paid_at, payment_method, receipt_no, mpesa_ref, term')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('paid_at', { ascending: false })
      .limit(5),

    svc
      .from('schools')
      .select('paybill_number, name')
      .eq('id', parent.schoolId)
      .maybeSingle(),
  ])

  const b = balance as { total_billed?: number; total_paid?: number; balance_due?: number; updated_at?: string } | null
  const sc = school as { paybill_number?: string | null; name?: string } | null

  return NextResponse.json({
    balance: b
      ? {
          invoiced_amount:  b.total_billed  ?? 0,
          paid_amount:      b.total_paid    ?? 0,
          current_balance:  b.balance_due   ?? 0,
          last_payment_at:  b.updated_at    ?? null,
        }
      : { invoiced_amount: 0, paid_amount: 0, current_balance: 0, last_payment_at: null },
    payments: (payments ?? []).map((p: Record<string, unknown>) => ({
      amount_paid:      p.amount_paid,
      payment_date:     p.paid_at,
      payment_method:   p.payment_method,
      receipt_number:   p.receipt_no,
      reference_number: p.mpesa_ref,
      term:             p.term,
    })),
    paybill: {
      number:      sc?.paybill_number ?? null,
      schoolName:  sc?.name ?? null,
      accountHint: 'Use student admission number as account',
    },
  })
}

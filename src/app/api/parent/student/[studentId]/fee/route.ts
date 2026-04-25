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

  const [{ data: balance }, { data: payments }, { data: school }] = await Promise.all([
    svc
      .from('fee_balances')
      .select('invoiced_amount, paid_amount, current_balance, last_payment_at, updated_at')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .maybeSingle(),

    svc
      .from('fee_records')
      .select('amount_paid, payment_date, payment_method, receipt_number, reference_number, term')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('payment_date', { ascending: false })
      .limit(5),

    svc
      .from('schools')
      .select('paybill_number, name')
      .eq('id', parent.schoolId)
      .maybeSingle(),
  ])

  const sc = school as { paybill_number: string | null; name: string } | null

  return NextResponse.json({
    balance: balance ?? { invoiced_amount: 0, paid_amount: 0, current_balance: 0, last_payment_at: null },
    payments: payments ?? [],
    paybill: {
      number:      sc?.paybill_number ?? null,
      schoolName:  sc?.name ?? null,
      accountHint: 'Use student admission number as account',
    },
  })
}

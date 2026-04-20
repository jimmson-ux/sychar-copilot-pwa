import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/fees?student_id=xxx
 * Returns fee balance, payment history, and next due date for one child.
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const [{ data: ledger }, { data: payments }] = await Promise.all([
    svc
      .from('student_fee_ledger')
      .select('balance_due, total_charged, total_paid, term, academic_year')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('academic_year', { ascending: false })
      .limit(6),
    svc
      .from('fee_payments')
      .select('amount, payment_date, method, reference, description')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('payment_date', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({ ledger: ledger ?? [], payments: payments ?? [] })
}

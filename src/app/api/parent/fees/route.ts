import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/fees?student_id=xxx
 * Returns fee balance summary and recent transactions for one child.
 *
 * Tables: fee_balances (one row per student), fee_transactions (ledger)
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const [{ data: balance }, { data: transactions }] = await Promise.all([
    svc
      .from('fee_balances')
      .select('*')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .single(),
    svc
      .from('fee_transactions')
      .select('id, amount, type, reference, term, year, created_at')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({ balance: balance ?? null, transactions: transactions ?? [] })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/wallet?student_id=xxx
 * Returns wallet balance and last 30 transactions.
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const [{ data: wallet }, { data: txns }] = await Promise.all([
    svc
      .from('student_wallets')
      .select('balance, currency, low_balance_alert, auto_topup_enabled, auto_topup_threshold, auto_topup_amount')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .single(),
    svc
      .from('wallet_transactions')
      .select('amount, type, description, created_at, reference')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({ wallet: wallet ?? null, transactions: txns ?? [] })
}

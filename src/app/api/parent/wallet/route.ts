import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/wallet?student_id=xxx
 * Returns wallet balance and last 30 transactions for one child.
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
      .select('balance_kes, daily_limit_kes, today_spent_kes, is_frozen, frozen_by, freeze_reason, updated_at')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .single(),
    svc
      .from('wallet_transactions')
      .select('id, ledger, direction, amount_kes, qty, item_type, tx_type, description, mpesa_ref, balance_after_kes, created_at')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({ wallet: wallet ?? null, transactions: txns ?? [] })
}

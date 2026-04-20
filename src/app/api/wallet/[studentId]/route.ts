// GET /api/wallet/[studentId]
// Returns balance, daily limit, today's spend, and available amount.
// Accessible by: canteen staff (any authenticated staff), bursar, principal.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  const { studentId } = await params

  const db = svc()

  // Fetch or auto-create wallet
  let { data: wallet } = await db
    .from('student_wallets')
    .select('id, balance, daily_limit, is_frozen, last_topup_at')
    .eq('school_id', auth.schoolId!)
    .eq('student_id', studentId)
    .single()

  if (!wallet) {
    // Auto-create with zero balance
    const { data: created } = await db
      .from('student_wallets')
      .insert({ school_id: auth.schoolId, student_id: studentId, balance: 0, daily_limit: 100 })
      .select('id, balance, daily_limit, is_frozen, last_topup_at')
      .single()
    wallet = created
  }

  if (!wallet) return NextResponse.json({ error: 'Could not resolve wallet' }, { status: 500 })

  type WalletRow = { id: string; balance: number; daily_limit: number; is_frozen: boolean; last_topup_at: string | null }
  const w = wallet as WalletRow

  // Today's spend
  const today = new Date().toISOString().split('T')[0]
  const { data: todayTx } = await db
    .from('wallet_transactions')
    .select('amount')
    .eq('school_id', auth.schoolId!)
    .eq('wallet_id', w.id)
    .eq('type', 'purchase')
    .gte('timestamp', today + 'T00:00:00Z')

  const todaySpend = (todayTx ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0)
  const available  = Math.max(0, Math.min(w.balance, w.daily_limit - todaySpend))

  // Fetch student name
  const { data: student } = await db
    .from('students')
    .select('full_name, class_name, photo_url')
    .eq('school_id', auth.schoolId!)
    .eq('id', studentId)
    .single()

  return NextResponse.json({
    wallet_id:    w.id,
    student_id:   studentId,
    student_name: (student as { full_name: string } | null)?.full_name ?? 'Unknown',
    class_name:   (student as { class_name: string } | null)?.class_name ?? null,
    photo_url:    (student as { photo_url: string } | null)?.photo_url ?? null,
    balance:      w.balance,
    daily_limit:  w.daily_limit,
    today_spend:  todaySpend,
    available,
    is_frozen:    w.is_frozen,
    last_topup_at: w.last_topup_at,
  })
}

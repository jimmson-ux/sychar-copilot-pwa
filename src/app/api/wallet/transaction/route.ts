// POST /api/wallet/transaction
// Processes a canteen purchase. Checks balance, daily limit, frozen status.
// Anti-bullying detection runs after every purchase.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db   = svc()
  const body = await req.json() as {
    student_id:  string
    amount:      number
    description?: string
  }

  if (!body.student_id || !body.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'student_id and positive amount required' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  // Fetch wallet
  const { data: wallet } = await db
    .from('student_wallets')
    .select('id, balance, daily_limit, is_frozen')
    .eq('school_id', auth.schoolId!)
    .eq('student_id', body.student_id)
    .single()

  if (!wallet) return NextResponse.json({ error: 'Wallet not found — student may not have a wallet yet' }, { status: 404 })

  type WalletRow = { id: string; balance: number; daily_limit: number; is_frozen: boolean }
  const w = wallet as WalletRow

  if (w.is_frozen) {
    return NextResponse.json({ error: 'Wallet is frozen — contact the bursar', frozen: true }, { status: 403 })
  }

  if (w.balance < body.amount) {
    return NextResponse.json({
      error:     'Insufficient balance',
      balance:   w.balance,
      requested: body.amount,
      shortfall: body.amount - w.balance,
    }, { status: 409 })
  }

  // Check daily limit
  const today = new Date().toISOString().split('T')[0]
  const { data: todayTx } = await db
    .from('wallet_transactions')
    .select('amount')
    .eq('school_id', auth.schoolId!)
    .eq('wallet_id', w.id)
    .eq('type', 'purchase')
    .gte('timestamp', today + 'T00:00:00Z')

  const todaySpend = (todayTx ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0)
  const remaining  = w.daily_limit - todaySpend

  if (body.amount > remaining) {
    return NextResponse.json({
      error:           'Daily limit exceeded',
      daily_limit:     w.daily_limit,
      today_spend:     todaySpend,
      available_today: Math.max(0, remaining),
      requested:       body.amount,
    }, { status: 409 })
  }

  const newBalance = w.balance - body.amount

  // Write transaction
  const now = new Date().toISOString()
  const { error: txErr } = await db.from('wallet_transactions').insert({
    school_id:    auth.schoolId,
    wallet_id:    w.id,
    type:         'purchase',
    amount:       body.amount,
    balance_after: newBalance,
    description:  body.description ?? 'Canteen purchase',
    processed_by: (staff as { id: string }).id,
    timestamp:    now,
  })
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  // Update wallet balance
  await db.from('student_wallets').update({ balance: newBalance }).eq('id', w.id)

  // ── Anti-bullying detection (async, non-blocking) ─────────────────────────
  const checkBullying = async () => {
    // 1. Multiple purchases in < 10 minutes
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recentTx, count: recentCount } = await db
      .from('wallet_transactions')
      .select('id', { count: 'exact' })
      .eq('wallet_id', w.id)
      .eq('type', 'purchase')
      .gte('timestamp', tenMinsAgo)

    if ((recentCount ?? 0) >= 3) {
      await db.from('alerts').insert({
        school_id: auth.schoolId,
        type:      'canteen_bullying',
        severity:  'high',
        title:     `Canteen: multiple rapid transactions for student ${body.student_id}`,
        detail:    { student_id: body.student_id, count: recentCount, window_mins: 10 },
      }).then(() => {}, () => {})
    }

    // 2. Balance at zero
    if (newBalance <= 0) {
      await db.from('alerts').insert({
        school_id: auth.schoolId,
        type:      'wallet_zero',
        severity:  'medium',
        title:     `Wallet emptied: student ${body.student_id}`,
        detail:    { student_id: body.student_id, balance: newBalance },
      }).then(() => {}, () => {})
    }

    // 3. No canteen use in last 5 days — checked via cron / separate job, not here
    void recentTx // suppress unused warning
  }

  // Fire and forget
  checkBullying().catch(() => {})

  return NextResponse.json({
    ok:            true,
    balance_after: newBalance,
    amount:        body.amount,
    timestamp:     now,
  })
}

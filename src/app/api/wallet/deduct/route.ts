// POST /api/wallet/deduct — canteen deduction with all guards
// Feature: pocket_money

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { tenantHasFeature } from '@/lib/tenantFeature'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!await tenantHasFeature(auth.schoolId!, 'pocket_money')) {
    return NextResponse.json({ error: 'pocket_money feature not enabled for this school' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    studentId:   string
    amount:      number
    description: string
  } | null

  if (!body?.studentId || !body.amount || !body.description?.trim()) {
    return NextResponse.json({ error: 'studentId, amount, description required' }, { status: 400 })
  }

  if (body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  }

  const db = svc()

  const { data: wallet, error: fetchErr } = await db
    .from('student_wallets')
    .select('id, balance, daily_limit, today_spent, is_frozen')
    .eq('school_id', auth.schoolId!)
    .eq('student_id', body.studentId)
    .single()

  if (fetchErr || !wallet) {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
  }

  type WalletRow = { id: string; balance: number; daily_limit: number; today_spent: number; is_frozen: boolean }
  const w = wallet as WalletRow

  if (w.is_frozen) {
    return NextResponse.json({ error: 'Wallet is frozen' }, { status: 403 })
  }

  if (w.balance < body.amount) {
    return NextResponse.json({ error: 'Insufficient balance', balance: w.balance }, { status: 422 })
  }

  const newSpent = (w.today_spent ?? 0) + body.amount
  if (w.daily_limit && newSpent > w.daily_limit) {
    return NextResponse.json({
      error:        'Daily spending limit exceeded',
      daily_limit:  w.daily_limit,
      today_spent:  w.today_spent,
      requested:    body.amount,
    }, { status: 422 })
  }

  const newBalance = w.balance - body.amount

  const { error: updateErr } = await db
    .from('student_wallets')
    .update({ balance: newBalance, today_spent: newSpent })
    .eq('id', w.id)

  if (updateErr) {
    console.error('[wallet/deduct] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await db.from('wallet_transactions').insert({
    school_id:   auth.schoolId,
    wallet_id:   w.id,
    student_id:  body.studentId,
    type:        'purchase',
    amount:      body.amount,
    description: body.description.trim(),
    recorded_by: auth.userId,
    timestamp:   new Date().toISOString(),
  }).then(() => {}, () => {})

  return NextResponse.json({
    ok:          true,
    balance:     newBalance,
    today_spent: newSpent,
    deducted:    body.amount,
  })
}

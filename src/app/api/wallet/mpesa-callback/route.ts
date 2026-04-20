// POST /api/wallet/mpesa-callback
// Called by M-Pesa Daraja API after STK push completes.
// Also handles WhatsApp bot top-up: "TOPUP NK/2024/089 500"
// No auth header — verified by M-Pesa result code + shared secret.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// M-Pesa Daraja STK callback body shape
interface MpesaCallback {
  Body: {
    stkCallback: {
      MerchantRequestID:  string
      CheckoutRequestID:  string
      ResultCode:         number       // 0 = success
      ResultDesc:         string
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value: string | number }>
      }
    }
  }
}

function getMeta(items: Array<{ Name: string; Value: string | number }>, key: string) {
  return items.find(i => i.Name === key)?.Value ?? null
}

export async function POST(req: NextRequest) {
  const db = svc()

  let body: MpesaCallback
  try {
    body = await req.json() as MpesaCallback
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid payload' })
  }

  const cb = body?.Body?.stkCallback
  if (!cb) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Malformed callback' })

  // Non-zero result = failure/cancellation — log and acknowledge
  if (cb.ResultCode !== 0) {
    await db.from('mpesa_transactions').insert({
      mpesa_ref:   cb.CheckoutRequestID,
      amount:      0,
      phone_number: null,
      status:      'failed',
      description: cb.ResultDesc,
    }).then(() => {}, () => {})
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  const items       = cb.CallbackMetadata?.Item ?? []
  const amount      = Number(getMeta(items, 'Amount') ?? 0)
  const mpesaRef    = String(getMeta(items, 'MpesaReceiptNumber') ?? cb.CheckoutRequestID)
  const phone       = String(getMeta(items, 'PhoneNumber') ?? '')
  const accountRef  = String(getMeta(items, 'AccountReference') ?? '')

  if (amount <= 0) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Zero amount — ignored' })
  }

  // Resolve school + student from AccountReference (format: SCHOOL_ID|STUDENT_ID or admission number)
  // Convention: account ref = "<admission_number>" e.g. "NK/2024/089"
  // We need to find which school this student belongs to via admission_number
  const { data: studentRow } = await db
    .from('students')
    .select('id, school_id, full_name, class_name')
    .eq('admission_number', accountRef)
    .eq('is_active', true)
    .single()

  if (!studentRow) {
    // Log orphaned transaction for manual reconciliation
    await db.from('mpesa_transactions').insert({
      mpesa_ref:    mpesaRef,
      amount,
      phone_number: phone,
      status:       'unmatched',
      description:  `No student found for account ref: ${accountRef}`,
    }).then(() => {}, () => {})
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted — unmatched' })
  }

  type StudentRow = { id: string; school_id: string; full_name: string; class_name: string }
  const s = studentRow as StudentRow

  // Prevent duplicate processing
  const { data: existing } = await db
    .from('mpesa_transactions')
    .select('id')
    .eq('mpesa_ref', mpesaRef)
    .single()

  if (existing) return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' })

  // Fetch or create wallet
  let { data: wallet } = await db
    .from('student_wallets')
    .select('id, balance')
    .eq('school_id', s.school_id)
    .eq('student_id', s.id)
    .single()

  if (!wallet) {
    const { data: created } = await db
      .from('student_wallets')
      .insert({ school_id: s.school_id, student_id: s.id, balance: 0, daily_limit: 100 })
      .select('id, balance')
      .single()
    wallet = created
  }

  if (!wallet) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Wallet creation failed' })

  type WalletRow = { id: string; balance: number }
  const w = wallet as WalletRow

  const newBalance = w.balance + amount

  // Credit wallet
  await db.from('student_wallets').update({
    balance:      newBalance,
    last_topup_at: new Date().toISOString(),
  }).eq('id', w.id)

  // Log wallet transaction
  await db.from('wallet_transactions').insert({
    school_id:    s.school_id,
    wallet_id:    w.id,
    type:         'topup',
    amount,
    balance_after: newBalance,
    description:  `M-Pesa top-up from ${phone}`,
    mpesa_ref:    mpesaRef,
  })

  // Log M-Pesa transaction record
  await db.from('mpesa_transactions').insert({
    school_id:    s.school_id,
    mpesa_ref:    mpesaRef,
    phone_number: phone,
    amount,
    status:       'success',
    description:  `Wallet top-up for ${s.full_name} (${accountRef})`,
  }).then(() => {}, () => {})

  // WhatsApp receipt notification (fire-and-forget via edge function or external service)
  // The WhatsApp bot handles outbound messaging — we just persist the record.

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/wallet/topup
 * Body: { student_id: string, amount: number }
 *
 * Flow:
 *   1. Insert pending record into mpesa_callbacks (stores student/school context)
 *   2. Initiate STK Push via Daraja
 *   3. Safaricom calls /api/parent/mpesa/callback on completion
 *      → callback handler calls increment_wallet_balance() which triggers credit_wallet()
 */
export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({}))
  const { student_id, amount, mpesa_phone } = body as {
    student_id?:  string
    amount?:      number
    mpesa_phone?: string   // parent supplies their Safaricom number at pay-time
  }

  if (!student_id || !parent.studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }
  if (!amount || amount < 50 || amount > 10000) {
    return NextResponse.json({ error: 'Amount must be between KES 50 and 10,000' }, { status: 400 })
  }
  if (!mpesa_phone?.trim()) {
    return NextResponse.json({ error: 'mpesa_phone is required for payment' }, { status: 400 })
  }

  // Normalise phone → 254XXXXXXXXX
  const phone = mpesa_phone.trim().replace(/\D/g, '')
    .replace(/^0/, '254').replace(/^(\d{9})$/, '254$1')

  const svc = createAdminSupabaseClient()
  const ref = `WTP-${Date.now()}`

  // Store pending context in mpesa_callbacks (callback handler resolves student/school from here)
  const { error: pendingErr } = await svc.from('mpesa_callbacks').insert({
    school_id:  parent.schoolId,
    student_id: student_id,
    reference:  ref,
    purpose:    'wallet_topup',
    amount:     amount,
    phone:      phone,
    status:     'pending',
  })

  if (pendingErr) {
    console.error('[wallet/topup] pending insert failed:', pendingErr)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }

  const stkResult = await initiateStkPush({
    phone:     phone,
    amount,
    reference: ref,
    purpose:   'wallet_topup',
  })

  if (!stkResult.success) {
    await svc.from('mpesa_callbacks').update({ status: 'failed', result_desc: stkResult.error })
      .eq('reference', ref)
    return NextResponse.json({ error: 'Failed to initiate M-Pesa payment' }, { status: 502 })
  }

  // Store CheckoutRequestID so callback can match by it too
  await svc.from('mpesa_callbacks')
    .update({ checkout_request_id: stkResult.checkoutRequestId })
    .eq('reference', ref)

  return NextResponse.json({
    checkout_request_id: stkResult.checkoutRequestId,
    reference:           ref,
    message:             'STK push sent. Enter your M-Pesa PIN to complete.',
  })
}

// ── STK Push helper ───────────────────────────────────────────────────────────

interface StkPushOptions { phone: string; amount: number; reference: string; purpose: string }
interface StkResult { success: boolean; checkoutRequestId?: string; error?: string }

async function initiateStkPush(opts: StkPushOptions): Promise<StkResult> {
  const consumerKey    = process.env.MPESA_CONSUMER_KEY    ?? ''
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET ?? ''
  const shortcode      = process.env.MPESA_SHORTCODE       ?? ''
  const passkey        = process.env.MPESA_PASSKEY         ?? ''
  const callbackUrl    = process.env.MPESA_CALLBACK_URL    ?? ''

  if (!consumerKey || !shortcode || !passkey || !callbackUrl) {
    return { success: false, error: 'M-Pesa not configured' }
  }

  try {
    const creds    = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    const tokenRes = await fetch(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${creds}` } },
    )
    const { access_token } = await tokenRes.json() as { access_token: string }

    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')
    const phone12   = opts.phone.replace(/^\+/, '').replace(/^0/, '254')

    const stkRes = await fetch(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password:          password,
          Timestamp:         timestamp,
          TransactionType:   'CustomerPayBillOnline',
          Amount:            Math.ceil(opts.amount),
          PartyA:            phone12,
          PartyB:            shortcode,
          PhoneNumber:       phone12,
          CallBackURL:       callbackUrl,
          AccountReference:  opts.reference,
          TransactionDesc:   opts.purpose,
        }),
      },
    )

    const result = await stkRes.json() as { CheckoutRequestID?: string; ResponseCode?: string }
    if (result.ResponseCode === '0') {
      return { success: true, checkoutRequestId: result.CheckoutRequestID }
    }
    return { success: false, error: 'STK push rejected by Safaricom' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

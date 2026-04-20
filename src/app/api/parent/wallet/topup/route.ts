import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/wallet/topup
 * Body: { student_id: string, amount: number }
 * Initiates an M-Pesa STK Push for wallet topup.
 * Amount range: KES 50–10,000.
 */
export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({}))
  const { student_id, amount } = body as { student_id?: string; amount?: number }

  if (!student_id || !parent.studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }
  if (!amount || amount < 50 || amount > 10000) {
    return NextResponse.json({ error: 'Amount must be between KES 50 and 10,000' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Fetch parent phone (from DB — never trust JWT for phone used in payment)
  const { data: session } = await svc
    .from('parent_sessions')
    .select('parent_phone')
    .eq('id', parent.sessionId)
    .eq('school_id', parent.schoolId)
    .single()

  if (!session?.parent_phone) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Create pending transaction record
  const { data: txn, error: txnErr } = await svc
    .from('wallet_transactions')
    .insert({
      school_id:   parent.schoolId,
      student_id:  student_id,
      amount:      amount,
      type:        'topup_pending',
      description: 'M-Pesa wallet topup',
      reference:   `WTP-${Date.now()}`,
    })
    .select('id, reference')
    .single()

  if (txnErr || !txn) {
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }

  // Initiate STK Push via Daraja (implementation in /api/parent/mpesa/callback)
  const stkResult = await initiateStkPush({
    phone:     session.parent_phone as string,
    amount,
    reference: txn.reference as string,
    purpose:   'wallet_topup',
    studentId: student_id,
    schoolId:  parent.schoolId,
  })

  if (!stkResult.success) {
    await svc.from('wallet_transactions').update({ type: 'topup_failed' }).eq('id', txn.id)
    return NextResponse.json({ error: 'Failed to initiate M-Pesa payment' }, { status: 502 })
  }

  return NextResponse.json({
    checkout_request_id: stkResult.checkoutRequestId,
    message:             'STK push sent. Enter your M-Pesa PIN to complete.',
  })
}

// ── STK Push helper ───────────────────────────────────────────────────────────

interface StkPushOptions {
  phone:     string
  amount:    number
  reference: string
  purpose:   string
  studentId: string
  schoolId:  string
}

async function initiateStkPush(opts: StkPushOptions) {
  const consumerKey    = process.env.MPESA_CONSUMER_KEY    ?? ''
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET ?? ''
  const shortcode      = process.env.MPESA_SHORTCODE        ?? ''
  const passkey        = process.env.MPESA_PASSKEY          ?? ''
  const callbackUrl    = process.env.MPESA_CALLBACK_URL     ?? ''

  if (!consumerKey || !shortcode || !passkey || !callbackUrl) {
    return { success: false, error: 'M-Pesa not configured' }
  }

  try {
    // Get OAuth token
    const creds = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    const tokenRes = await fetch(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${creds}` } },
    )
    const { access_token } = await tokenRes.json() as { access_token: string }

    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')

    const phone12 = opts.phone.replace(/^\+/, '').replace(/^0/, '254')

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
    return { success: false, error: 'STK push rejected' }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// POST /api/fees/stk-push
// Initiates M-Pesa STK Push to a parent's phone for fee payment.
// Bursar and principal only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['principal', 'bursar'])

async function getDarajaToken(): Promise<string> {
  const key    = process.env.MPESA_CONSUMER_KEY!
  const secret = process.env.MPESA_CONSUMER_SECRET!
  const creds  = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  )
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: bursar or principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    studentId: string
    amount: number
    phone: string
    description?: string
  } | null

  if (!body?.studentId || !body.amount || !body.phone) {
    return NextResponse.json({ error: 'studentId, amount, phone required' }, { status: 400 })
  }

  const db = svc()

  // Verify student belongs to this school
  const { data: student } = await db
    .from('students')
    .select('id, full_name, admission_number')
    .eq('id', body.studentId)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Normalise phone: 07XXXXXXXX → 2547XXXXXXXX
  const phone = body.phone.replace(/\s/g, '').replace(/^0/, '254').replace(/^\+/, '')
  if (!/^254[17]\d{8}$/.test(phone)) {
    return NextResponse.json({ error: 'Invalid Kenyan phone number' }, { status: 400 })
  }

  const shortcode  = process.env.MPESA_SHORTCODE ?? '174379'
  const passkey    = process.env.MPESA_PASSKEY ?? ''
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sychar.co.ke'}/api/parent/mpesa/callback`
  const timestamp  = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
  const password   = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')

  try {
    const token = await getDarajaToken()
    const stkRes = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: Math.round(body.amount),
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: student.admission_number ?? student.id.slice(0, 8),
          TransactionDesc: body.description ?? `Fee payment — ${student.full_name}`,
        }),
      }
    )
    const stkData = await stkRes.json() as {
      CheckoutRequestID?: string
      ResponseCode?: string
      ResponseDescription?: string
      errorCode?: string
    }

    if (stkData.ResponseCode !== '0') {
      console.error('[stk-push] Daraja error', stkData)
      return NextResponse.json({ error: stkData.ResponseDescription ?? 'STK push failed' }, { status: 502 })
    }

    // Log the STK push attempt
    await db.from('mpesa_transactions').insert({
      school_id:     auth.schoolId,
      student_id:    body.studentId,
      phone_number:  phone,
      amount:        body.amount,
      mpesa_ref:     stkData.CheckoutRequestID ?? '',
      description:   `STK push — ${student.full_name}`,
      status:        'pending',
    }).then(() => {}, (e) => console.error('[stk-push] log error', e))

    return NextResponse.json({ ok: true, checkoutRequestId: stkData.CheckoutRequestID })
  } catch (err) {
    console.error('[stk-push] unexpected error', err)
    return NextResponse.json({ error: 'STK push failed — check M-Pesa credentials' }, { status: 502 })
  }
}

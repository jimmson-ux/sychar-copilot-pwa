import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/mpesa/callback
 *
 * Receives Safaricom Daraja STK Push callback.
 * Routes by AccountReference prefix:
 *   WTP-{ts}                      → wallet topup
 *   VCH-{ts}                      → voucher purchase
 *   FEE-{studentId}-{term}-{year} → school fees payment
 *
 * Pending context (student_id, school_id, purpose) is stored in
 * mpesa_callbacks by the initiating route (topup / voucher purchase).
 * This handler updates the same record and processes the payment.
 */

const SAFARICOM_CIDRS = [
  '196.201.214.0/24',
  '196.201.214.200/24',
  '196.201.216.0/24',
  '196.201.218.0/24',
  '196.201.220.0/24',
  '196.201.222.0/24',
]

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/')
  const mask     = ~((1 << (32 - Number(bits))) - 1)
  const ipNum    = ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0)
  const rangeNum = range.split('.').reduce((a, o) => (a << 8) + Number(o), 0)
  return (ipNum & mask) === (rangeNum & mask)
}

function isSafaricomIp(ip: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  return SAFARICOM_CIDRS.some((cidr) => ipInCidr(ip, cidr))
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0'
  )
}

interface DarajaItem { Name: string; Value?: string | number }
interface DarajaBody {
  stkCallback: {
    MerchantRequestID: string
    CheckoutRequestID: string
    ResultCode:        number
    ResultDesc:        string
    CallbackMetadata?: { Item: DarajaItem[] }
  }
}

function extractMeta(items: DarajaItem[], key: string): string | number | undefined {
  return items.find((i) => i.Name === key)?.Value
}

type Svc = ReturnType<typeof createAdminSupabaseClient>

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!isSafaricomIp(ip)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { Body: DarajaBody }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Bad request' })
  }

  const cb = body?.Body?.stkCallback
  if (!cb) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Malformed callback' })

  const svc = createAdminSupabaseClient()

  if (cb.ResultCode !== 0) {
    await handleFailed(svc, cb.CheckoutRequestID, cb.ResultDesc)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  const items   = cb.CallbackMetadata?.Item ?? []
  const amount  = Number(extractMeta(items, 'Amount'))
  const receipt = String(extractMeta(items, 'MpesaReceiptNumber') ?? '')
  const phone   = String(extractMeta(items, 'PhoneNumber') ?? '')
  const ref     = String(extractMeta(items, 'AccountReference') ?? '')

  if (!receipt || !ref) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing metadata' })
  }

  // Idempotency — skip if receipt already processed
  const { data: existing } = await svc
    .from('mpesa_callbacks')
    .select('id')
    .eq('receipt', receipt)
    .maybeSingle()

  if (existing) return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' })

  // Route by reference prefix
  if (ref.startsWith('WTP-')) {
    await handleWalletTopup(svc, ref, amount, receipt, cb.CheckoutRequestID, body)
  } else if (ref.startsWith('VCH-')) {
    await handleVoucherPurchase(svc, ref, amount, receipt, body)
  } else if (ref.startsWith('FEE-')) {
    await handleSchoolFees(svc, ref, amount, receipt, phone, body)
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

async function handleFailed(svc: Svc, checkoutRequestId: string, reason: string) {
  await svc
    .from('mpesa_callbacks')
    .update({ status: 'failed', result_desc: reason, updated_at: new Date().toISOString() })
    .eq('checkout_request_id', checkoutRequestId)
    .eq('status', 'pending')
}

async function handleWalletTopup(
  svc:               Svc,
  ref:               string,
  amount:            number,
  receipt:           string,
  checkoutRequestId: string,
  raw:               unknown,
) {
  // Resolve pending context from mpesa_callbacks
  const { data: pending } = await svc
    .from('mpesa_callbacks')
    .select('id, student_id, school_id')
    .eq('reference', ref)
    .eq('purpose', 'wallet_topup')
    .eq('status', 'pending')
    .single()

  if (!pending) {
    // Fallback: try by checkout_request_id
    const { data: byCheckout } = await svc
      .from('mpesa_callbacks')
      .select('id, student_id, school_id')
      .eq('checkout_request_id', checkoutRequestId)
      .eq('status', 'pending')
      .single()

    if (!byCheckout) return
    Object.assign(pending ?? {}, byCheckout)
  }

  if (!pending?.student_id || !pending?.school_id) return

  // Credit wallet — triggers apply_wallet_transaction() which updates balance
  await svc.rpc('increment_wallet_balance', {
    p_student_id:  pending.student_id,
    p_school_id:   pending.school_id,
    p_amount:      amount,
    p_mpesa_ref:   receipt,
    p_description: `M-Pesa wallet topup — ${receipt}`,
  })

  // Update pending record with final status
  await svc
    .from('mpesa_callbacks')
    .update({
      receipt,
      result_code: 0,
      result_desc: 'Success',
      status:      'success',
      raw:         raw as never,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', pending.id)
}

async function handleVoucherPurchase(
  svc:     Svc,
  ref:     string,
  amount:  number,
  receipt: string,
  raw:     unknown,
) {
  const { data: pending } = await svc
    .from('mpesa_callbacks')
    .select('id, student_id, school_id')
    .eq('reference', ref)
    .eq('purpose', 'voucher_purchase')
    .eq('status', 'pending')
    .single()

  if (!pending?.student_id || !pending?.school_id) return

  // Find the voucher_products entry that matches the pending amount for this school
  const { data: product } = await svc
    .from('voucher_products')
    .select('id, item_type, item_label, unit_label, qty, valid_days')
    .eq('school_id', pending.school_id)
    .eq('price_kes', amount)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!product) {
    await svc.from('mpesa_callbacks').update({ status: 'failed', result_desc: 'No matching product', updated_at: new Date().toISOString() }).eq('id', pending.id)
    return
  }

  const p = product as { id: string; item_type: string; item_label: string; unit_label: string; qty: number; valid_days: number }
  const validUntil = new Date(Date.now() + p.valid_days * 86_400_000).toISOString().slice(0, 10)

  const { data: studentData } = await svc
    .from('students')
    .select('full_name, admission_no')
    .eq('id', pending.student_id)
    .single()

  const { data: voucher } = await svc
    .from('student_vouchers')
    .upsert(
      {
        school_id:    pending.school_id,
        student_id:   pending.student_id,
        student_name: (studentData as { full_name: string } | null)?.full_name ?? '',
        admission_no: (studentData as { admission_no: string } | null)?.admission_no ?? null,
        item_type:    p.item_type,
        item_label:   p.item_label,
        unit_label:   p.unit_label,
        valid_from:   new Date().toISOString().slice(0, 10),
        valid_until:  validUntil,
        is_active:    true,
      },
      { onConflict: 'school_id,student_id,item_type,valid_from', ignoreDuplicates: false },
    )
    .select('id')
    .single()

  if (voucher) {
    await svc.rpc('issue_vouchers', {
      p_voucher_id:  voucher.id,
      p_qty:         p.qty,
      p_description: `M-Pesa purchase — ${receipt}`,
    })
  }

  await svc
    .from('mpesa_callbacks')
    .update({
      receipt,
      result_code: 0,
      result_desc: 'Success',
      status:      'success',
      raw:         raw as never,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', pending.id)
}

async function handleSchoolFees(
  svc:     Svc,
  ref:     string,
  amount:  number,
  receipt: string,
  _phone:  string,
  raw:     unknown,
) {
  // ref format: FEE-{studentId}-{term}-{year}
  const parts = ref.split('-')
  if (parts.length < 4) return
  const [, studentId, term, year] = parts

  // Resolve school_id from student
  const { data: student } = await svc
    .from('students')
    .select('school_id')
    .eq('id', studentId)
    .single()

  if (!student?.school_id) return

  const schoolId = student.school_id as string

  // Insert fee transaction
  await svc.from('fee_transactions').insert({
    school_id:  schoolId,
    student_id: studentId,
    amount:     amount,
    type:       'Payment',
    reference:  receipt,
    term:       Number(term),
    year:       Number(year),
  })

  // Update fee_balances paid amount — handles both column naming conventions
  await svc.rpc('update_fee_balance_on_payment', {
    p_student_id: studentId,
    p_amount:     amount,
  }).then(() => {}).catch(async () => {
    // Fallback: direct update for either column name
    await svc
      .from('fee_balances')
      .update({ paid_amount: amount, last_payment_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('school_id', schoolId)
      .then(() => {})
  })

  // Log to mpesa_callbacks for audit
  await svc.from('mpesa_callbacks').insert({
    school_id:   schoolId,
    student_id:  studentId,
    reference:   ref,
    receipt,
    amount,
    purpose:     'school_fees',
    result_code: 0,
    result_desc: 'Success',
    status:      'success',
    raw:         raw as never,
  })
}

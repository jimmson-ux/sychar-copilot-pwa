import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/mpesa/callback
 *
 * Receives Safaricom Daraja STK Push callback.
 * Handles three transaction purposes determined by AccountReference prefix:
 *   WTP-{ts}   → wallet topup
 *   VCH-{ts}   → voucher purchase
 *   FEE-{ts}   → school fees payment
 *
 * Security:
 *   - Safaricom IP allowlist (CIDR ranges published in Daraja docs)
 *   - No auth token required (Safaricom pushes to us)
 *   - Idempotency: duplicate MpesaReceiptNumber is silently ignored
 */

// Safaricom production IP ranges (from Daraja documentation)
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
  const mask    = ~((1 << (32 - Number(bits))) - 1)
  const ipNum   = ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0)
  const rangeNum = range.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0)
  return (ipNum & mask) === (rangeNum & mask)
}

function isSafaricomIp(ip: string): boolean {
  // Allow bypass in development
  if (process.env.NODE_ENV !== 'production') return true
  return SAFARICOM_CIDRS.some(cidr => ipInCidr(ip, cidr))
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0'
  )
}

// ── Daraja callback shape ─────────────────────────────────────────────────────

interface DarajaItem  { Name: string; Value?: string | number }
interface DarajaBody  {
  stkCallback: {
    MerchantRequestID:  string
    CheckoutRequestID:  string
    ResultCode:         number
    ResultDesc:         string
    CallbackMetadata?: { Item: DarajaItem[] }
  }
}

function extractMeta(items: DarajaItem[], key: string): string | number | undefined {
  return items.find(i => i.Name === key)?.Value
}

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

  // Failed payment (ResultCode !== 0)
  if (cb.ResultCode !== 0) {
    await handleFailedPayment(svc, cb.CheckoutRequestID, cb.ResultDesc)
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

  // Idempotency: skip if receipt already processed
  const { data: existing } = await svc
    .from('mpesa_callbacks')
    .select('id')
    .eq('receipt', receipt)
    .single()

  if (existing) return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' })

  // Log the callback
  await svc.from('mpesa_callbacks').insert({
    checkout_request_id: cb.CheckoutRequestID,
    receipt,
    amount,
    phone,
    reference:  ref,
    result_code: cb.ResultCode,
    result_desc: cb.ResultDesc,
    raw:         body,
  })

  // Route by reference prefix
  if (ref.startsWith('WTP-')) {
    await handleWalletTopup(svc, ref, amount, receipt)
  } else if (ref.startsWith('VCH-')) {
    await handleVoucherPurchase(svc, ref, amount, receipt)
  } else if (ref.startsWith('FEE-')) {
    await handleSchoolFees(svc, ref, amount, receipt, phone)
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

// ── Handlers ──────────────────────────────────────────────────────────────────

type Svc = ReturnType<typeof createAdminSupabaseClient>

async function handleFailedPayment(svc: Svc, checkoutRequestId: string, reason: string) {
  // Mark any pending wallet transaction as failed
  await svc
    .from('wallet_transactions')
    .update({ type: 'topup_failed', description: reason })
    .eq('reference', checkoutRequestId)
    .eq('type', 'topup_pending')

  // Mark any pending voucher as cancelled
  await svc
    .from('bread_vouchers')
    .update({ status: 'cancelled' })
    .eq('mpesa_reference', checkoutRequestId)
    .eq('status', 'pending_payment')
}

async function handleWalletTopup(svc: Svc, ref: string, amount: number, receipt: string) {
  const { data: txn } = await svc
    .from('wallet_transactions')
    .select('id, student_id, school_id')
    .eq('reference', ref)
    .eq('type', 'topup_pending')
    .single()

  if (!txn) return

  await Promise.all([
    // Update transaction status
    svc.from('wallet_transactions')
      .update({ type: 'topup', description: `M-Pesa topup — ${receipt}` })
      .eq('id', txn.id),
    // Credit wallet
    svc.rpc('increment_wallet_balance', {
      p_student_id: txn.student_id,
      p_school_id:  txn.school_id,
      p_amount:     amount,
    }),
  ])
}

async function handleVoucherPurchase(svc: Svc, ref: string, amount: number, receipt: string) {
  await svc
    .from('bread_vouchers')
    .update({
      status:       'active',
      activated_at: new Date().toISOString(),
      mpesa_reference: receipt,
    })
    .eq('mpesa_reference', ref)
    .eq('status', 'pending_payment')
}

async function handleSchoolFees(
  svc: Svc,
  ref: string,
  amount: number,
  receipt: string,
  phone: string,
) {
  // ref format: FEE-{studentId}-{term}-{year}
  const parts = ref.split('-')
  if (parts.length < 4) return

  const [, studentId, term, year] = parts

  await svc.from('fee_payments').insert({
    reference:    receipt,
    student_id:   studentId,
    amount,
    payment_date: new Date().toISOString().slice(0, 10),
    method:       'mpesa',
    description:  `M-Pesa school fees — ${receipt}`,
    term:         Number(term),
    academic_year: year,
  })
}

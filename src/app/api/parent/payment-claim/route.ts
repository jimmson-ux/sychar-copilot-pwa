import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/payment-claim — a parent submits proof of a fee payment.
 * NEVER auto-credits: the claim is staged + anti-fraud checked (transaction-code
 * uniqueness, statement auto-match) via submit_payment_claim(); Accounts verifies
 * and posts it. Scoped to the parent's own verified child.
 *
 * Body: { studentId, amount, method, transaction_code?, txn_date?, paybill?,
 *         account_ref?, bank_name?, evidence_url? }
 */
export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const studentId = String(b.studentId ?? '')
  const amount = Number(b.amount ?? 0)
  const method = String(b.method ?? '')

  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Access denied for that student' }, { status: 403 })
  }
  if (!(amount > 0)) return NextResponse.json({ error: 'amount required' }, { status: 400 })
  if (!['mpesa', 'bank', 'cash', 'cheque'].includes(method)) {
    return NextResponse.json({ error: 'method must be mpesa|bank|cash|cheque' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()
  const { data: stu } = await svc.from('students').select('admission_no').eq('id', studentId).eq('school_id', parent.schoolId).maybeSingle()

  const { data, error } = await svc.rpc('submit_payment_claim', {
    p_school_id: parent.schoolId,
    p_student_id: studentId,
    p_admission_no: (stu as { admission_no?: string } | null)?.admission_no ?? null,
    p_parent_id: parent.sessionId ?? null,
    p_amount: amount,
    p_method: method,
    p_txn_code: b.transaction_code ? String(b.transaction_code).trim().toUpperCase() : null,
    p_txn_date: b.txn_date ?? null,
    p_paybill: b.paybill ?? null,
    p_account_ref: b.account_ref ?? null,
    p_bank_name: b.bank_name ?? null,
    p_evidence_url: b.evidence_url ?? null,
  })
  if (error) {
    console.error('[parent/payment-claim]', error)
    return NextResponse.json({ error: 'Failed to submit claim' }, { status: 500 })
  }
  const row = (data as { claim_id: string; claim_status: string }[] | null)?.[0]
  const statusMsg: Record<string, string> = {
    matched: 'Payment found and matched — pending Accounts verification.',
    pending: 'Submitted — under verification by Accounts.',
    duplicate: 'This transaction code has already been submitted.',
  }
  return NextResponse.json({ ok: row?.claim_status !== 'duplicate', claim_id: row?.claim_id, status: row?.claim_status, message: statusMsg[row?.claim_status ?? 'pending'] ?? 'Submitted.' })
}

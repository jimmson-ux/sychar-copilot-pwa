import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/finance/payment-claims — Bursar/Accounts review queue for parent fee claims.
 *   GET  ?status=pending|matched|exceptions → list (exceptions = pending+amount_mismatch+not_found)
 *   PATCH { id, action: 'verify'|'reject'|'post', notes? }
 *     post → writes the verified claim to the fee_payments ledger (one code posts once).
 */
const FIN = new Set(['bursar', 'accounts_clerk', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!FIN.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  const status = new URL(req.url).searchParams.get('status')
  let q = svc.from('payment_claims')
    .select('id, student_id, admission_no, amount, method, transaction_code, txn_date, status, match_type, evidence_url, notes, created_at')
    .eq('school_id', auth.schoolId).order('created_at', { ascending: false }).limit(300)
  if (status === 'exceptions') q = q.in('status', ['pending', 'duplicate'])
  else if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ claims: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!FIN.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { id?: string; action?: string; notes?: string }
  if (!b.id || !['verify', 'reject', 'post'].includes(b.action ?? '')) {
    return NextResponse.json({ error: 'id and valid action required' }, { status: 400 })
  }
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).maybeSingle()
  const staffId = (me as { id: string } | null)?.id ?? null

  const { data: claim } = await svc.from('payment_claims')
    .select('id, student_id, amount, method, transaction_code, txn_date, status')
    .eq('id', b.id).eq('school_id', auth.schoolId).maybeSingle()
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  const c = claim as { id: string; student_id: string | null; amount: number; method: string; transaction_code: string | null; txn_date: string | null; status: string }

  if (b.action === 'reject') {
    await svc.from('payment_claims').update({ status: 'rejected', reviewed_by: staffId, reviewed_at: new Date().toISOString(), notes: b.notes ?? null }).eq('id', c.id).eq('school_id', auth.schoolId)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }
  if (b.action === 'verify') {
    await svc.from('payment_claims').update({ status: 'verified', reviewed_by: staffId, reviewed_at: new Date().toISOString() }).eq('id', c.id).eq('school_id', auth.schoolId)
    return NextResponse.json({ ok: true, status: 'verified' })
  }

  // post → write to the fee_payments ledger, then mark posted.
  if (!c.student_id) return NextResponse.json({ error: 'Claim has no linked student — cannot post.' }, { status: 400 })
  const { data: pay, error: payErr } = await svc.from('fee_payments').insert({
    school_id: auth.schoolId, student_id: c.student_id, amount: c.amount,
    payment_method: c.method, mpesa_code: c.transaction_code,
    payment_date: c.txn_date ?? new Date().toISOString().slice(0, 10),
    pending_confirmation: false, submitted_by: staffId,
  }).select('id').single()
  if (payErr) {
    console.error('[finance/payment-claims] post', payErr)
    return NextResponse.json({ error: 'Failed to post to ledger' }, { status: 500 })
  }
  await svc.from('payment_claims').update({
    status: 'posted', fee_payment_id: (pay as { id: string }).id, reviewed_by: staffId, reviewed_at: new Date().toISOString(),
  }).eq('id', c.id).eq('school_id', auth.schoolId)
  return NextResponse.json({ ok: true, status: 'posted', fee_payment_id: (pay as { id: string }).id })
}

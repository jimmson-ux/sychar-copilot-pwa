import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/finance/statement-upload — Accounts uploads parsed M-Pesa/bank statement
 * rows so parent claims auto-reconcile. Body: { source:'mpesa'|'bank', entries:[
 *   { transaction_code, amount, txn_date?, payer_name?, raw? } ] }.
 * After insert, any PENDING claim whose code now has a matching entry is upgraded to
 * 'matched' (auto) or flagged 'amount_mismatch'. Returns counts.
 */
const FIN = new Set(['bursar', 'accounts_clerk', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!FIN.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { source?: string; entries?: Array<Record<string, unknown>> }
  const source = b.source === 'bank' ? 'bank' : 'mpesa'
  const entries = Array.isArray(b.entries) ? b.entries : []
  if (entries.length === 0) return NextResponse.json({ error: 'entries[] required' }, { status: 400 })

  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).maybeSingle()
  const staffId = (me as { id: string } | null)?.id ?? null

  const rows = entries
    .filter((e) => e.transaction_code && Number(e.amount) > 0)
    .map((e) => ({
      school_id: auth.schoolId, source,
      transaction_code: String(e.transaction_code).trim().toUpperCase(),
      amount: Number(e.amount), txn_date: e.txn_date ?? null,
      payer_name: e.payer_name ?? null, raw: e.raw ?? null, uploaded_by: staffId,
    }))
  if (rows.length === 0) return NextResponse.json({ error: 'no valid entries' }, { status: 400 })

  const { error: upErr } = await svc.from('statement_entries')
    .upsert(rows, { onConflict: 'school_id,source,transaction_code', ignoreDuplicates: true })
  if (upErr) { console.error('[statement-upload]', upErr); return NextResponse.json({ error: 'Upload failed' }, { status: 500 }) }

  // Reconcile pending claims against the newly available entries.
  let matched = 0, mismatch = 0
  const codes = rows.map((r) => r.transaction_code)
  const { data: claims } = await svc.from('payment_claims')
    .select('id, amount, transaction_code')
    .eq('school_id', auth.schoolId).eq('status', 'pending').in('transaction_code', codes)
  for (const cl of (claims as { id: string; amount: number; transaction_code: string }[] ?? [])) {
    const entry = rows.find((r) => r.transaction_code === cl.transaction_code)
    if (!entry) continue
    const ok = Number(entry.amount) === Number(cl.amount)
    await svc.from('payment_claims').update({
      status: ok ? 'matched' : 'pending',
      match_type: ok ? 'auto' : 'amount_mismatch',
    }).eq('id', cl.id).eq('school_id', auth.schoolId)
    if (ok) matched++; else mismatch++
  }
  return NextResponse.json({ ok: true, uploaded: rows.length, reconciled_matched: matched, amount_mismatches: mismatch })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { z } from 'zod'

const BURSAR_ROLES = new Set(['bursar', 'principal', 'deputy_principal'])

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/bursar/unreconciled?limit=50
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!BURSAR_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200)
  const sb    = svc()

  const { data, error } = await sb
    .from('unreconciled_payments')
    .select('id, school_id, raw_reference, amount, payment_mode, sender_name, sender_phone, payment_date, bill_ref, status, created_at')
    .eq('school_id', auth.schoolId)
    .eq('status', 'Unmatched')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[bursar/unreconciled] GET:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

const reconcileSchema = z.object({
  payment_id: z.string().uuid(),
  student_id: z.string().uuid(),
  term:       z.number().int().min(1).max(3).optional(),
  year:       z.number().int().min(2020).max(2040).optional(),
})

// PATCH /api/bursar/unreconciled
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!BURSAR_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = reconcileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }, { status: 422 })
  }

  const { payment_id, student_id, term, year } = parsed.data
  const { schoolId, userId } = auth
  const sb = svc()

  // Fetch unreconciled payment
  const { data: payment, error: fetchErr } = await sb
    .from('unreconciled_payments')
    .select('id, raw_reference, amount, payment_mode, status')
    .eq('id', payment_id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (fetchErr || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
  if ((payment as { status: string }).status === 'Resolved') {
    return NextResponse.json({ error: 'Already resolved' }, { status: 409 })
  }

  // Verify student is active and belongs to this school
  const { data: student } = await sb
    .from('students')
    .select('id')
    .eq('id', student_id)
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .maybeSingle()

  if (!student) {
    return NextResponse.json({ error: 'Student not found or inactive' }, { status: 404 })
  }

  type PaymentRow = { raw_reference: string; amount: number; payment_mode: string }
  const p = payment as PaymentRow

  // Post to fee_transactions — trg_sync_fee_balance auto-updates fee_balances
  const { data: tx, error: txErr } = await sb
    .from('fee_transactions')
    .insert({
      school_id:   schoolId,
      student_id,
      amount:      p.amount,
      type:        'Payment',
      reference:   p.raw_reference,
      source:      String(p.payment_mode ?? 'mpesa_c2b').toLowerCase().replace('mpesa', 'mpesa_c2b'),
      notes:       `Reconciled from unreconciled queue. Ref: ${p.raw_reference}`,
      recorded_by: userId,
      term:        term ?? null,
      year:        year ?? null,
    })
    .select('id')
    .single()

  if (txErr) {
    console.error('[bursar/unreconciled] PATCH fee_transactions insert:', txErr.message)
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  // Mark as resolved
  const { error: resolveErr } = await sb
    .from('unreconciled_payments')
    .update({
      status:      'Resolved',
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
      student_id,
      fee_tx_id:   tx.id,
    })
    .eq('id', payment_id)

  if (resolveErr) {
    console.error('[bursar/unreconciled] PATCH resolve update:', resolveErr.message)
  }

  return NextResponse.json({ ok: true, fee_tx_id: tx.id })
}

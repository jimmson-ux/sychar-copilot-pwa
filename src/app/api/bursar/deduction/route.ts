export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { z } from 'zod'

const BURSAR_ROLES = new Set(['bursar', 'principal', 'deputy_principal'])
const PRINCIPAL_ROLES = new Set(['principal', 'deputy_principal'])
const LARGE_DEDUCTION_THRESHOLD = 5000

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const deductionSchema = z.object({
  student_id:     z.string().uuid(),
  amount:         z.number().positive().max(500_000),
  deduction_type: z.enum(['Bursary', 'Waiver', 'Scholarship', 'Government_Subsidy']),
  source:         z.string().min(2),
  reason:         z.string().min(10),
  term:           z.number().int().min(1).max(3).optional(),
  year:           z.number().int().min(2020).max(2040).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!BURSAR_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: bursar or principal only' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = deductionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation error' }, { status: 422 })
  }

  const { student_id, amount, deduction_type, source, reason, term, year } = parsed.data
  const { schoolId, userId } = auth
  const sb = svc()

  // Authorization guard for large deductions
  if (amount > LARGE_DEDUCTION_THRESHOLD && !PRINCIPAL_ROLES.has(auth.subRole)) {
    return NextResponse.json(
      { error: `Deductions above KES ${LARGE_DEDUCTION_THRESHOLD.toLocaleString()} require Principal or Deputy Principal authorization.` },
      { status: 403 },
    )
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

  // Insert fee_transaction — trg_sync_fee_balance auto-updates fee_balances
  const { data: tx, error: txErr } = await sb
    .from('fee_transactions')
    .insert({
      school_id:   schoolId,
      student_id,
      amount,
      type:        'Bursary',
      source:      'deduction',
      reference:   `${deduction_type}-${Date.now()}`,
      notes:       `${deduction_type}: ${reason}`,
      recorded_by: userId,
      term:        term ?? null,
      year:        year ?? null,
    })
    .select('id')
    .single()

  if (txErr) {
    console.error('[bursar/deduction] fee_transactions insert:', txErr.message)
    return NextResponse.json({ error: txErr.message }, { status: 500 })
  }

  // Audit trail in bursaries
  const { error: bursaryErr } = await sb.from('bursaries').insert({
    school_id:       schoolId,
    student_id,
    source,
    amount,
    award_reference: reason,
    year:            year ?? new Date().getFullYear(),
    applied_at:      new Date().toISOString(),
    recorded_by:     userId,
  })

  if (bursaryErr) {
    console.error('[bursar/deduction] bursaries insert:', bursaryErr.message)
  }

  // Return updated balance
  const { data: balance } = await sb
    .from('fee_balances')
    .select('current_balance')
    .eq('student_id', student_id)
    .maybeSingle()

  return NextResponse.json({
    ok:          true,
    fee_tx_id:   tx.id,
    new_balance: Number((balance as { current_balance?: unknown } | null)?.current_balance ?? 0),
  })
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!BURSAR_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const params    = req.nextUrl.searchParams
  const studentId = params.get('student_id')
  const limit     = Math.min(Number(params.get('limit') ?? 50), 200)
  const sb        = svc()

  let q = sb
    .from('fee_transactions')
    .select('id, student_id, amount, reference, notes, source, created_at, recorded_by')
    .eq('school_id', auth.schoolId)
    .eq('type', 'Bursary')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (studentId) q = q.eq('student_id', studentId)

  const { data, error } = await q
  if (error) {
    console.error('[bursar/deduction] GET:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

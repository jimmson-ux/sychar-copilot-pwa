// POST /api/fees/virement
// Transfers budget between FDSE vote-heads with ministry compliance check.
// Principal ONLY.
// Same category (e.g. KICD → Activity): warning, allowed.
// Cross-category (e.g. Tuition → RMI): BLOCKED unless BOM minutes uploaded.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// All 4 FDSE heads belong to Operations — cross-sub-category is the warning boundary.
// MoE treats RMI + Tuition as "Instruction" and Activity + KICD as "Operations".
const INSTRUCTION_CODES = new Set(['RMI', 'TUI'])
const OPERATIONS_CODES  = new Set(['ACT', 'KICD'])

function getMinistryCategory(code: string): string {
  if (INSTRUCTION_CODES.has(code)) return 'Instruction'
  if (OPERATIONS_CODES.has(code))  return 'Operations'
  return code
}

type VoteHead = {
  id: string
  name: string
  code: string
  category: string
  allocated_amount: number
  spent_amount: number
  term: number
  academic_year: string
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    fromHead: string         // vote-head name or code
    toHead: string
    amount: number
    justification: string
    bomMinutesUrl?: string   // required for cross-category override
  } | null

  if (!body?.fromHead || !body.toHead || !body.amount || !body.justification) {
    return NextResponse.json(
      { error: 'fromHead, toHead, amount, justification required' },
      { status: 400 }
    )
  }
  if (body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  }
  if (body.fromHead === body.toHead) {
    return NextResponse.json({ error: 'Cannot transfer to the same vote-head' }, { status: 400 })
  }

  const db = svc()
  const month = new Date().getMonth() + 1
  const currentTerm = month <= 4 ? 1 : month <= 8 ? 2 : 3
  const currentYear = String(new Date().getFullYear())

  // Resolve heads by name or code
  const { data: heads, error: headsErr } = await db
    .from('vote_heads')
    .select('id, name, code, category, allocated_amount, spent_amount, term, academic_year')
    .eq('school_id', auth.schoolId!)
    .eq('term', currentTerm)
    .eq('academic_year', currentYear)

  if (headsErr) {
    console.error('[fees/virement] fetch heads:', headsErr.message)
    return NextResponse.json({ error: 'Failed to load vote-heads' }, { status: 500 })
  }

  const allHeads = (heads ?? []) as VoteHead[]

  const normalize = (s: string) => s.trim().toUpperCase()
  const from = allHeads.find(
    h => normalize(h.name) === normalize(body.fromHead) || normalize(h.code) === normalize(body.fromHead)
  )
  const to = allHeads.find(
    h => normalize(h.name) === normalize(body.toHead) || normalize(h.code) === normalize(body.toHead)
  )

  if (!from) return NextResponse.json({ error: `Vote-head not found: ${body.fromHead}` }, { status: 404 })
  if (!to)   return NextResponse.json({ error: `Vote-head not found: ${body.toHead}` }, { status: 404 })

  const available = (from.allocated_amount ?? 0) - (from.spent_amount ?? 0)
  if (body.amount > available) {
    return NextResponse.json({
      error: `Insufficient balance in ${from.name}: available KES ${available.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
    }, { status: 409 })
  }

  const fromMinistryCat = getMinistryCategory(from.code)
  const toMinistryCat   = getMinistryCategory(to.code)
  const isCrossCategory = fromMinistryCat !== toMinistryCat

  if (isCrossCategory && !body.bomMinutesUrl) {
    return NextResponse.json({
      blocked: true,
      reason: `Cross-category virement (${fromMinistryCat} → ${toMinistryCat}) requires BOM board minutes. Upload the minutes document and retry with bomMinutesUrl.`,
      fromCategory: fromMinistryCat,
      toCategory:   toMinistryCat,
    }, { status: 403 })
  }

  const { data: staffRow } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  // Record transaction
  const { error: txErr } = await db.from('vote_head_transactions').insert({
    school_id:         auth.schoolId,
    from_vote_head_id: from.id,
    to_vote_head_id:   to.id,
    amount:            body.amount,
    justification:     body.justification,
    is_cross_category: isCrossCategory,
    bom_document_url:  body.bomMinutesUrl ?? null,
    approved_by:       (staffRow as { id: string } | null)?.id ?? null,
  })

  if (txErr) {
    console.error('[fees/virement] insert tx:', txErr.message)
    return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 })
  }

  // Move allocated_amount: deduct from source, add to destination
  await Promise.all([
    db.from('vote_heads')
      .update({ allocated_amount: (from.allocated_amount ?? 0) - body.amount })
      .eq('id', from.id)
      .eq('school_id', auth.schoolId!),
    db.from('vote_heads')
      .update({ allocated_amount: (to.allocated_amount ?? 0) + body.amount })
      .eq('id', to.id)
      .eq('school_id', auth.schoolId!),
  ])

  // Return updated heads
  const { data: updated } = await db
    .from('vote_heads')
    .select('id, name, code, category, allocated_amount, spent_amount')
    .eq('school_id', auth.schoolId!)
    .eq('term', currentTerm)
    .eq('academic_year', currentYear)

  return NextResponse.json({
    success: true,
    from: from.name,
    to: to.name,
    amount: body.amount,
    isCrossCategory,
    warning: !isCrossCategory ? 'Same-category transfer — recorded for audit' : undefined,
    updatedHeads: updated ?? [],
  })
}

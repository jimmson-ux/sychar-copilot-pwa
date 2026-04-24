// POST /api/fees/fdse-entry
// Records an FDSE receipt and distributes it across the 4 MoE vote-head buckets.
// Bursar and principal only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Kenya MoE FDSE per-learner rates (Total = KES 4,143.07)
const FDSE_SPLITS = [
  { code: 'RMI',      name: 'RMI',      pct: 0.4942 },
  { code: 'ACT',      name: 'Activity', pct: 0.0603 },
  { code: 'TUI',      name: 'Tuition',  pct: 0.2533 },
  { code: 'KICD',     name: 'KICD',     pct: 0.1921 },
]

const ALLOWED = new Set(['principal', 'bursar'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: bursar or principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    amount: number
    payment_method: string
    reference: string
    date: string
    academic_year?: string
    term?: number
  } | null

  if (!body?.amount || !body.payment_method || !body.reference || !body.date) {
    return NextResponse.json(
      { error: 'amount, payment_method, reference, date required' },
      { status: 400 }
    )
  }
  if (body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  }

  const db = svc()
  const year = body.academic_year ?? String(new Date().getFullYear())
  const month = new Date().getMonth() + 1
  const term = body.term ?? (month <= 4 ? 1 : month <= 8 ? 2 : 3)

  // Fetch existing vote-heads for this school/term
  const { data: heads } = await db
    .from('vote_heads')
    .select('id, code, name, allocated_amount, spent_amount')
    .eq('school_id', auth.schoolId!)
    .eq('academic_year', year)
    .eq('term', term)

  const headsMap: Record<string, { id: string; allocated_amount: number; spent_amount: number }> =
    Object.fromEntries((heads ?? []).map(h => [h.code, h]))

  const splits: { code: string; name: string; amount: number; vote_head_id: string | null }[] = []

  // Calculate split amounts and update spent_amount on each vote-head
  for (const s of FDSE_SPLITS) {
    const splitAmt = Math.round(body.amount * s.pct * 100) / 100
    const head = headsMap[s.code]

    if (head) {
      await db
        .from('vote_heads')
        .update({ spent_amount: (head.spent_amount ?? 0) + splitAmt })
        .eq('id', head.id)
    }

    splits.push({
      code: s.code,
      name: s.name,
      amount: splitAmt,
      vote_head_id: head?.id ?? null,
    })
  }

  // Log the incoming FDSE transaction
  await db.from('vote_head_transactions').insert(
    splits
      .filter(s => s.vote_head_id)
      .map(s => ({
        school_id:        auth.schoolId,
        from_vote_head_id: s.vote_head_id!,
        to_vote_head_id:  s.vote_head_id!,
        amount:           s.amount,
        justification:    `FDSE receipt — ${body.reference} — ${body.payment_method}`,
        is_cross_category: false,
        created_at:       new Date(body.date).toISOString(),
      }))
  )

  // Fetch updated vote-head balances to return
  const { data: updatedHeads } = await db
    .from('vote_heads')
    .select('id, code, name, category, allocated_amount, spent_amount')
    .eq('school_id', auth.schoolId!)
    .eq('academic_year', year)
    .eq('term', term)

  return NextResponse.json({
    ok: true,
    received: body.amount,
    splits,
    vote_heads: updatedHeads ?? [],
  })
}

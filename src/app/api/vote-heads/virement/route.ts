// POST /api/vote-heads/virement — principal only
// Transfers budget between vote-heads with category enforcement.
// Same category: warning only, allowed.
// Cross-category: BLOCKED unless bom_document_url is provided.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    from_vote_head_id: string
    to_vote_head_id:   string
    amount:            number
    justification:     string
    bom_document_url?: string  // required for cross-category override
  }

  if (!body.from_vote_head_id || !body.to_vote_head_id || !body.amount || !body.justification) {
    return NextResponse.json({ error: 'from_vote_head_id, to_vote_head_id, amount, justification required' }, { status: 400 })
  }
  if (body.amount <= 0) return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  if (body.from_vote_head_id === body.to_vote_head_id) {
    return NextResponse.json({ error: 'Cannot transfer to the same vote-head' }, { status: 400 })
  }

  // Fetch both vote-heads
  const { data: vhs } = await db
    .from('vote_heads')
    .select('id, name, code, category, allocated_amount, spent_amount')
    .eq('school_id', auth.schoolId!)
    .in('id', [body.from_vote_head_id, body.to_vote_head_id])

  if (!vhs || vhs.length < 2) {
    return NextResponse.json({ error: 'One or both vote-heads not found' }, { status: 404 })
  }

  type VH = { id: string; name: string; code: string; category: string; allocated_amount: number; spent_amount: number }
  const from = (vhs as VH[]).find(v => v.id === body.from_vote_head_id)!
  const to   = (vhs as VH[]).find(v => v.id === body.to_vote_head_id)!

  const available = from.allocated_amount - from.spent_amount
  if (body.amount > available) {
    return NextResponse.json({
      error: `Insufficient balance in ${from.name}: available KSH ${available.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
    }, { status: 409 })
  }

  const isCrossCategory = from.category !== to.category

  // Cross-category: BLOCKED unless BOM minutes document uploaded
  if (isCrossCategory && !body.bom_document_url) {
    return NextResponse.json({
      error: `Cross-category virement blocked: ${from.category} → ${to.category}. Upload BOM minutes to override.`,
      blocked:       true,
      is_cross_category: true,
      from_category: from.category,
      to_category:   to.category,
    }, { status: 403 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  // Log the virement
  const { data: tx, error: txErr } = await db.from('vote_head_transactions').insert({
    school_id:         auth.schoolId,
    from_vote_head_id: body.from_vote_head_id,
    to_vote_head_id:   body.to_vote_head_id,
    amount:            body.amount,
    justification:     body.justification,
    is_cross_category: isCrossCategory,
    is_blocked:        false,
    bom_document_url:  body.bom_document_url ?? null,
    approved_by:       (staff as { id: string } | null)?.id ?? null,
  }).select('id').single()

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  // Deduct from source, credit to destination
  await Promise.all([
    db.from('vote_heads')
      .update({ allocated_amount: from.allocated_amount - body.amount })
      .eq('id', body.from_vote_head_id)
      .eq('school_id', auth.schoolId!),
    db.from('vote_heads')
      .update({ allocated_amount: to.allocated_amount + body.amount })
      .eq('id', body.to_vote_head_id)
      .eq('school_id', auth.schoolId!),
  ])

  return NextResponse.json({
    ok:                true,
    transaction_id:    (tx as { id: string }).id,
    from:              from.name,
    to:                to.name,
    amount:            body.amount,
    is_cross_category: isCrossCategory,
    warning:           isCrossCategory ? null : (from.category === to.category ? 'Same-category transfer — recorded with warning' : null),
  })
}

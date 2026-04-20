// PATCH /api/nurse/stock/[id] — decrement (or restock) a stock item
// Body: { delta: number, reason?: string }
// Negative delta = used, positive = restocked
// After update: checks threshold → principal alert if below

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['nurse', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()
  const body   = await req.json() as { delta: number; reason?: string }

  if (body.delta === 0 || body.delta == null) {
    return NextResponse.json({ error: 'delta required (negative=used, positive=restock)' }, { status: 400 })
  }

  const { data: item } = await db
    .from('nurse_stock_items')
    .select('id, item_name, current_count, min_threshold, unit')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const it         = item as { id: string; item_name: string; current_count: number; min_threshold: number; unit: string }
  const newCount   = Math.max(0, it.current_count + body.delta)

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  // Update count
  await db.from('nurse_stock_items').update({
    current_count: newCount,
    updated_at:    new Date().toISOString(),
  }).eq('id', id)

  // Log usage
  await db.from('nurse_stock_logs').insert({
    school_id:       auth.schoolId,
    item_id:         id,
    quantity_change: body.delta,
    count_after:     newCount,
    reason:          body.reason ?? (body.delta < 0 ? 'Used' : 'Restocked'),
    logged_by:       (staff as { id: string } | null)?.id ?? null,
  })

  // Check threshold → alert principal
  if (newCount <= it.min_threshold) {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'nurse_stock_low',
      severity:  newCount === 0 ? 'high' : 'medium',
      title:     `Nurse stock${newCount === 0 ? ' OUT' : ' low'}: ${it.item_name} — ${newCount} ${it.unit} remaining`,
      detail:    { item_id: id, item_name: it.item_name, current_count: newCount, min_threshold: it.min_threshold },
    }).then(() => {}, () => {})
  }

  const status = newCount === 0                         ? 'empty'
               : newCount <= it.min_threshold / 2       ? 'red'
               : newCount <= it.min_threshold            ? 'amber'
               : 'green'

  return NextResponse.json({ ok: true, item_id: id, count_after: newCount, status })
}

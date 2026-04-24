// PATCH /api/requisitions/[id]/fulfill
// Storekeeper ONLY — records how many of each item was physically issued.
// Updates aie_forms status to 'fulfilled' when all items are done.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type FulfilledItem = {
  itemName: string       // match against aie_forms.items[].description
  quantityFulfilled: number
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['storekeeper', 'principal'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: storekeeper only' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null) as {
    items: FulfilledItem[]
  } | null

  if (!body?.items?.length) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 })
  }

  const db = svc()

  const { data: form, error: fetchErr } = await db
    .from('aie_forms')
    .select('id, status, items')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !form) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  }

  type FormRow = {
    id: string
    status: string
    items: Array<{ description: string; unit: string; quantity: number; amount: number; quantity_fulfilled?: number }>
  }
  const f = form as FormRow

  if (f.status !== 'approved') {
    return NextResponse.json({
      error: `Cannot fulfill a requisition with status '${f.status}' — must be 'approved'`,
    }, { status: 409 })
  }

  // Merge fulfilled quantities into the items array
  const updatedItems = f.items.map(item => {
    const fulfilled = body.items.find(
      b => b.itemName.trim().toLowerCase() === item.description.trim().toLowerCase()
    )
    return {
      ...item,
      quantity_fulfilled: fulfilled?.quantityFulfilled ?? item.quantity_fulfilled ?? 0,
    }
  })

  const allFulfilled = updatedItems.every(
    i => (i.quantity_fulfilled ?? 0) >= i.quantity
  )

  const { error: updateErr } = await db.from('aie_forms').update({
    items:        updatedItems,
    status:       allFulfilled ? 'fulfilled' : 'approved',
    fulfilled_at: allFulfilled ? new Date().toISOString() : null,
  }).eq('id', id).eq('school_id', auth.schoolId!)

  if (updateErr) {
    console.error('[requisitions/fulfill]', updateErr.message)
    return NextResponse.json({ error: 'Failed to update requisition' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    status:      allFulfilled ? 'fulfilled' : 'approved',
    allFulfilled,
    updatedItems,
  })
}

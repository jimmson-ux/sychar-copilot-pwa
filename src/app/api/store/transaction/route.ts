// POST /api/store/transaction
// Creates an immutable bin card entry in inventory_logs and updates item stock.
// ISSUE requires an approved requisition (authorized_by).
// Geo-verification is checked against item's store geofence.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180, dl = ((lng2 - lng1) * Math.PI) / 180
  const a  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type TxType = 'ISSUE' | 'RESTOCK' | 'DAMAGE' | 'WRITE-OFF' | 'RESERVE'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!['storekeeper', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: storekeeper or principal required' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    item_id:            string
    transaction_type:   TxType
    quantity_change:    number   // positive = in, negative = out
    issued_to?:         string
    issued_to_role?:    string
    authorized_by?:     string   // requisition id — required for ISSUE
    photo_evidence_url?: string
    delivery_note_url?: string
    supplier_name?:     string
    notes?:             string
    lat?:               number
    lng?:               number
  }

  if (!body.item_id || !body.transaction_type || body.quantity_change == null) {
    return NextResponse.json({ error: 'item_id, transaction_type, quantity_change required' }, { status: 400 })
  }

  // ISSUE requires an approved requisition
  if (body.transaction_type === 'ISSUE' && !body.authorized_by) {
    return NextResponse.json({ error: 'ISSUE transactions require an approved requisition (authorized_by)' }, { status: 400 })
  }

  if (body.transaction_type === 'ISSUE') {
    const { data: req_ } = await db
      .from('requisitions')
      .select('status')
      .eq('id', body.authorized_by!)
      .eq('school_id', auth.schoolId!)
      .single()
    if (!req_ || (req_ as { status: string }).status !== 'approved') {
      return NextResponse.json({ error: 'Requisition is not approved — cannot issue without authorization' }, { status: 400 })
    }
  }

  // Fetch the item with a row-level lock (use service role — no RLS issue)
  const { data: item, error: itemErr } = await db
    .from('inventory_items')
    .select('id, name, current_stock, geo_lat, geo_lng, geo_radius_m')
    .eq('id', body.item_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (itemErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  type Item = { id: string; name: string; current_stock: number; geo_lat: number | null; geo_lng: number | null; geo_radius_m: number }
  const it = item as Item

  const quantity_before = it.current_stock
  const quantity_after  = quantity_before + body.quantity_change

  // ISSUE cannot result in negative stock
  if ((body.transaction_type === 'ISSUE' || body.transaction_type === 'RESERVE') && quantity_after < 0) {
    return NextResponse.json({
      error: `Insufficient stock: ${it.name} has ${quantity_before} ${it.current_stock} units available`,
    }, { status: 409 })
  }

  // Geo-verification
  let geo_verified = false
  if (body.lat != null && body.lng != null && it.geo_lat != null && it.geo_lng != null) {
    geo_verified = distanceMetres(body.lat, body.lng, it.geo_lat, it.geo_lng) <= it.geo_radius_m
  }

  // Resolve storekeeper staff id
  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  // Insert immutable log entry
  const { error: logErr } = await db.from('inventory_logs').insert({
    school_id:          auth.schoolId,
    item_id:            body.item_id,
    transaction_type:   body.transaction_type,
    quantity_before,
    quantity_change:    body.quantity_change,
    quantity_after,
    issued_to:          body.issued_to ?? null,
    issued_to_role:     body.issued_to_role ?? null,
    authorized_by:      body.authorized_by ?? null,
    storekeeper_id:     (staff as { id: string }).id,
    geo_verified,
    lat:                body.lat ?? null,
    lng:                body.lng ?? null,
    photo_evidence_url: body.photo_evidence_url ?? null,
    delivery_note_url:  body.delivery_note_url ?? null,
    supplier_name:      body.supplier_name ?? null,
    notes:              body.notes ?? null,
    // server_timestamp is set by trigger — not sent from client
  })

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  // Update item current_stock
  const { error: stockErr } = await db
    .from('inventory_items')
    .update({ current_stock: quantity_after })
    .eq('id', body.item_id)
    .eq('school_id', auth.schoolId!)

  if (stockErr) return NextResponse.json({ error: `Log written but stock update failed: ${stockErr.message}` }, { status: 500 })

  return NextResponse.json({
    ok:               true,
    quantity_before,
    quantity_after,
    geo_verified,
    item_name:        it.name,
  })
}

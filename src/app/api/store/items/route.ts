// GET   /api/store/items — list all inventory items with current stock
// POST  /api/store/items — create a new inventory item
// PATCH /api/store/items — update item details (not stock — use /api/store/transaction)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const WRITE_ROLES = new Set(['storekeeper', 'principal'])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  const db = svc()

  const { data, error } = await db
    .from('inventory_items')
    .select('id, name, unit, category, current_stock, min_stock, reorder_point, store_location, daily_ration, geo_lat, geo_lng, geo_radius_m, is_active')
    .eq('school_id', auth.schoolId!)
    .eq('is_active', true)
    .order('category')
    .order('name')

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!WRITE_ROLES.has(auth.subRole ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db   = svc()
  const body = await req.json()

  if (!body.name || !body.unit) return NextResponse.json({ error: 'name and unit required' }, { status: 400 })

  const { data, error } = await db.from('inventory_items').insert({
    school_id:      auth.schoolId,
    name:           body.name,
    unit:           body.unit,
    category:       body.category ?? 'General',
    current_stock:  body.current_stock ?? 0,
    min_stock:      body.min_stock ?? 0,
    reorder_point:  body.reorder_point ?? 0,
    store_location: body.store_location ?? null,
    daily_ration:   body.daily_ration ?? null,
    geo_lat:        body.geo_lat ?? null,
    geo_lng:        body.geo_lng ?? null,
    geo_radius_m:   body.geo_radius_m ?? 50,
  }).select('id').single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!WRITE_ROLES.has(auth.subRole ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db   = svc()
  const body = await req.json() as { id: string; [k: string]: unknown }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  for (const k of ['name','unit','category','min_stock','reorder_point','store_location','daily_ration','geo_lat','geo_lng','geo_radius_m','is_active']) {
    if (body[k] !== undefined) allowed[k] = body[k]
  }

  const { error } = await db.from('inventory_items').update(allowed).eq('id', body.id).eq('school_id', auth.schoolId!)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

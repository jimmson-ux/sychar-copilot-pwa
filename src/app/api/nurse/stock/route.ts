// GET  /api/nurse/stock — top items list with status color
// POST /api/nurse/stock — add or update a stock item (nurse/principal)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { data, error } = await db
    .from('nurse_stock_items')
    .select('id, item_name, current_count, unit, min_threshold, category, updated_at')
    .eq('school_id', auth.schoolId!)
    .order('item_name')
    .limit(30)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const items = (data ?? []).map((i: {
    id: string; item_name: string; current_count: number;
    unit: string; min_threshold: number; category: string; updated_at: string
  }) => ({
    ...i,
    status: i.current_count === 0           ? 'empty'
          : i.current_count <= i.min_threshold / 2 ? 'red'
          : i.current_count <= i.min_threshold     ? 'amber'
          : 'green',
  }))

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['nurse', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    item_name:     string
    current_count: number
    unit?:         string
    min_threshold?: number
    category?:     string
  }

  if (!body.item_name || body.current_count == null) {
    return NextResponse.json({ error: 'item_name and current_count required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('nurse_stock_items')
    .upsert({
      school_id:     auth.schoolId,
      item_name:     body.item_name.trim(),
      current_count: body.current_count,
      unit:          body.unit          ?? 'units',
      min_threshold: body.min_threshold ?? 10,
      category:      body.category      ?? 'medication',
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'school_id,item_name' })
    .select('id, item_name, current_count')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

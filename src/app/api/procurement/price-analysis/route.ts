// GET /api/procurement/price-analysis — price history + trend for an item

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set(['accountant','principal','deputy_principal'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const itemName   = searchParams.get('itemName')
  const supplierId = searchParams.get('supplierId')

  if (!itemName) return NextResponse.json({ error: 'itemName required' }, { status: 400 })

  const db = createAdminSupabaseClient()

  const { data: history } = await db.rpc('get_item_price_trend', {
    p_school_id: auth.schoolId,
    p_item_name: itemName,
    p_months:    6,
  })

  let filtered = history ?? []
  if (supplierId) {
    // filter by supplier after the fact (RPC doesn't take supplier param)
    const { data: supplierHistory } = await db
      .from('procurement_price_history')
      .select('delivery_date, unit_price_kes, quantity, supplier_name')
      .eq('school_id', auth.schoolId!)
      .eq('supplier_id', supplierId)
      .ilike('item_name', `%${itemName.toLowerCase()}%`)
      .order('delivery_date', { ascending: false })
      .limit(20)
    filtered = supplierHistory ?? []
  }

  const prices = (filtered as { unit_price_kes: number }[]).map(r => Number(r.unit_price_kes)).filter(Boolean)
  const currentPrice = prices[0] ?? null
  const avg3m        = prices.slice(0, 6).length
    ? Math.round(prices.slice(0, 6).reduce((s, p) => s + p, 0) / prices.slice(0, 6).length)
    : null
  const lowest     = prices.length ? Math.min(...prices) : null
  const highest    = prices.length ? Math.max(...prices) : null

  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (prices.length >= 2) {
    const recent = prices.slice(0, 3).reduce((s, p) => s + p, 0) / Math.min(3, prices.length)
    const older  = prices.slice(3, 6).reduce((s, p) => s + p, 0) / Math.max(1, prices.slice(3, 6).length)
    if (recent > older * 1.05) trend = 'increasing'
    else if (recent < older * 0.95) trend = 'decreasing'
  }

  return NextResponse.json({
    item:            itemName,
    priceHistory:    filtered,
    currentPrice,
    avgPrice3months: avg3m,
    lowestRecorded:  lowest,
    highestRecorded: highest,
    trendDirection:  trend,
  })
}

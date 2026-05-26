import { createClient }              from '@supabase/supabase-js'
import { NextRequest, NextResponse }  from 'next/server'
import { requireAuth }                from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/inventory/consumption-alerts  — unacknowledged AI alerts
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const admin = getAdmin()
  const { data, error } = await admin
    .from('consumption_alerts')
    .select(`
      id, predicted_depletion_date, days_remaining,
      weekly_consumption_rate, confidence_level,
      reasoning, recommended_order_quantity, recommended_order_date,
      is_acknowledged, created_at,
      inventory_items!item_id ( name, unit, current_stock, category )
    `)
    .eq('school_id', auth.schoolId)
    .eq('is_acknowledged', false)
    .order('days_remaining', { ascending: true })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ alerts: data ?? [] })
}

// PATCH /api/inventory/consumption-alerts  — acknowledge an alert
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const ALLOWED = ['storekeeper','bursar','principal','super_admin']
  if (!ALLOWED.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { id: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = getAdmin()
  const { error } = await admin
    .from('consumption_alerts')
    .update({
      is_acknowledged:  true,
      acknowledged_by:  auth.userId,
      acknowledged_at:  new Date().toISOString(),
    })
    .eq('id', body.id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

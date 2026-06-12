import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/nurse/medication — medication stock (shared by student + staff visits).
 *   GET  → stock levels + low-stock flags + recent movements
 *   POST → { action: 'restock'|'adjust', medication_id?|name, quantity, unit?, reorder_level? }
 */
const NURSE_ROLES = new Set(['nurse', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!NURSE_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createAdminSupabaseClient()
  const [{ data: meds }, { data: moves }] = await Promise.all([
    svc.from('nurse_medications').select('id, name, unit, stock_qty, reorder_level, updated_at').eq('school_id', auth.schoolId).order('name'),
    svc.from('nurse_stock_movements').select('id, medication_id, change_qty, reason, patient_kind, created_at').eq('school_id', auth.schoolId).order('created_at', { ascending: false }).limit(50),
  ])
  const stock = (meds as any[] ?? [])
  const low = stock.filter((m) => Number(m.stock_qty) <= Number(m.reorder_level))
  return NextResponse.json({ stock, low_stock: low, movements: moves ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!NURSE_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    action?: string; medication_id?: string; name?: string; quantity?: number; unit?: string; reorder_level?: number
  }
  const action = body.action === 'adjust' ? 'adjustment' : 'restock'
  const qty = Number(body.quantity)
  if (!qty || Number.isNaN(qty)) return NextResponse.json({ error: 'quantity required' }, { status: 400 })

  const svc = createAdminSupabaseClient()
  const { data: nurse } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()

  // Resolve or create the medication.
  let medId = body.medication_id ?? null
  if (!medId && body.name?.trim()) {
    const { data: existing } = await svc.from('nurse_medications').select('id').eq('school_id', auth.schoolId).ilike('name', body.name.trim()).maybeSingle()
    if (existing) medId = (existing as { id: string }).id
    else {
      const { data: created } = await svc.from('nurse_medications')
        .insert({ school_id: auth.schoolId, name: body.name.trim(), unit: body.unit ?? 'unit', stock_qty: 0, reorder_level: body.reorder_level ?? 0 })
        .select('id').single()
      medId = (created as { id: string } | null)?.id ?? null
    }
  }
  if (!medId) return NextResponse.json({ error: 'medication_id or name required' }, { status: 400 })

  const { data: cur } = await svc.from('nurse_medications').select('stock_qty').eq('id', medId).single()
  const newQty = Number((cur as { stock_qty: number } | null)?.stock_qty ?? 0) + qty  // adjust can be negative
  const patch: Record<string, unknown> = { stock_qty: newQty, updated_at: new Date().toISOString() }
  if (body.reorder_level != null) patch.reorder_level = body.reorder_level
  await svc.from('nurse_medications').update(patch).eq('id', medId)

  await svc.from('nurse_stock_movements').insert({
    school_id: auth.schoolId, medication_id: medId, change_qty: qty, reason: action, created_by: (nurse as { id: string } | null)?.id ?? null,
  })

  return NextResponse.json({ ok: true, medication_id: medId, new_stock: newQty })
}

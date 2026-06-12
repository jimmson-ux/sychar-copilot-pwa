import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/gate/shift
 *
 * The shared "Gate Control" account is logged in at the gate kiosk. The on-duty
 * guard (rotating, contracted) identifies per shift so the system always knows
 * who is on the gate.
 *
 *   GET   → current open shift (current_gate_shift RPC)
 *   POST  → start a shift  { guard_name, guard_id_number, shift: 'day'|'night' }
 *   PATCH → end the open shift  { shift_id? }   (ends the latest open one if omitted)
 */

const SHIFTS = new Set(['day', 'night'])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.rpc('current_gate_shift', { p_school_id: auth.schoolId })
  if (error) {
    console.error('[gate/shift] GET', error)
    return NextResponse.json({ error: 'Failed to load current shift' }, { status: 500 })
  }
  const current = Array.isArray(data) ? data[0] ?? null : data ?? null
  return NextResponse.json({ current })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { guard_name, guard_id_number, shift } = body as {
    guard_name?: string; guard_id_number?: string; shift?: string
  }

  if (!guard_name?.trim() || !guard_id_number?.trim() || !shift || !SHIFTS.has(shift)) {
    return NextResponse.json(
      { error: 'guard_name, guard_id_number and shift (day|night) are required' },
      { status: 400 },
    )
  }

  const svc = createAdminSupabaseClient()

  // Auto-close any shift left open (guards sometimes forget to hand over).
  await svc
    .from('gate_shift_log')
    .update({ ended_at: new Date().toISOString() })
    .eq('school_id', auth.schoolId)
    .is('ended_at', null)

  const { data, error } = await svc
    .from('gate_shift_log')
    .insert({
      school_id: auth.schoolId,
      guard_name: guard_name.trim(),
      guard_id_number: guard_id_number.trim(),
      shift,
      started_at: new Date().toISOString(),
    })
    .select('id, guard_name, shift, started_at')
    .single()

  if (error) {
    console.error('[gate/shift] POST', error)
    return NextResponse.json({ error: 'Failed to start shift' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, shift: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const shiftId = (body as { shift_id?: string }).shift_id

  const svc = createAdminSupabaseClient()
  let q = svc
    .from('gate_shift_log')
    .update({ ended_at: new Date().toISOString() })
    .eq('school_id', auth.schoolId)
    .is('ended_at', null)

  if (shiftId) q = q.eq('id', shiftId)

  const { data, error } = await q.select('id, ended_at')
  if (error) {
    console.error('[gate/shift] PATCH', error)
    return NextResponse.json({ error: 'Failed to end shift' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ended: data ?? [] })
}

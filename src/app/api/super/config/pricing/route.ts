export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db = adminClient()
  const { data, error } = await db
    .from('global_settings')
    .select('addon_pricing')
    .eq('id', 1)
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ pricing: data?.addon_pricing ?? {} })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const VALID_KEYS = ['gate_pass', 'visitor_log', 'staff_attendance', 'pocket_money', 'bread_voucher']
  const update: Record<string, number> = {}
  for (const key of VALID_KEYS) {
    if (typeof body[key] === 'number' && body[key] >= 0) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No valid pricing keys' }, { status: 400 })

  const db = adminClient()
  const { data: current } = await db.from('global_settings').select('addon_pricing').eq('id', 1).single()
  const merged = { ...(current?.addon_pricing ?? {}), ...update }

  const { error } = await db.from('global_settings').update({ addon_pricing: merged }).eq('id', 1)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'config_pricing_update', entity_type: 'system', entity_id: null, meta: update,
  })

  return NextResponse.json({ ok: true, pricing: merged })
}

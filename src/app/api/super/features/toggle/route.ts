export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  const { school_id, feature, enabled } = body ?? {}

  const VALID_FEATURES = ['gate_pass', 'visitor_log', 'staff_attendance', 'pocket_money', 'bread_voucher']
  if (!school_id || !feature || typeof enabled !== 'boolean' || !VALID_FEATURES.includes(feature)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const db = adminClient()

  const { data: school } = await db
    .from('schools')
    .select('features')
    .eq('id', school_id)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const updated = { ...(school.features ?? {}), [feature]: enabled }

  const { error } = await db
    .from('schools')
    .update({ features: updated })
    .eq('id', school_id)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id:    auth.ctx.userId,
    actor_email: auth.ctx.email,
    action:      'feature_toggle',
    entity_type: 'school',
    entity_id:   school_id,
    meta:        { feature, enabled },
  })

  return NextResponse.json({ ok: true, features: updated })
}

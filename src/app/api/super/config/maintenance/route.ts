export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db = adminClient()
  const { data } = await db.from('global_settings').select('maintenance_mode, maintenance_message').eq('id', 1).single()
  return NextResponse.json({
    maintenance_mode:    data?.maintenance_mode    ?? false,
    maintenance_message: data?.maintenance_message ?? '',
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.maintenance_mode    === 'boolean') update.maintenance_mode    = body.maintenance_mode
  if (typeof body.maintenance_message === 'string')  update.maintenance_message = body.maintenance_message

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const db = adminClient()
  const { error } = await db.from('global_settings').update(update).eq('id', 1)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'config_maintenance', entity_type: 'system', entity_id: null, meta: update,
  })

  return NextResponse.json({ ok: true })
}

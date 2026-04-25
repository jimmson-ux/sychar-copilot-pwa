export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db = adminClient()
  void db.from('god_mode_audit').insert({
    actor_id:    auth.ctx.userId,
    actor_email: auth.ctx.email,
    action:      'impersonate_end',
    entity_type: 'session',
    entity_id:   null,
    meta:        {},
  })

  return NextResponse.json({ ok: true })
}

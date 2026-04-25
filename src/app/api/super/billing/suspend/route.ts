export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { school_id, reason } = await req.json().catch(() => ({}))
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const db = adminClient()

  const { data: school } = await db.from('schools').select('id, name').eq('id', school_id).single()
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const { error } = await db.from('schools').update({ is_active: false }).eq('id', school_id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'billing_suspend', entity_type: 'school', entity_id: school_id,
    meta: { school_name: school.name, reason: reason ?? null },
  })

  return NextResponse.json({ ok: true })
}

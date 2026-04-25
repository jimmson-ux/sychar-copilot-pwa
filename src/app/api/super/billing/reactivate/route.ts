export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { school_id } = await req.json().catch(() => ({}))
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const db = adminClient()

  const { data: school } = await db.from('schools').select('id, name, subscription_expires_at').eq('id', school_id).single()
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const expired = new Date(school.subscription_expires_at) < new Date()
  const newExpiry = expired
    ? new Date(Date.now() + 30 * 86_400_000).toISOString()
    : school.subscription_expires_at

  const { error } = await db.from('schools').update({ is_active: true, subscription_expires_at: newExpiry }).eq('id', school_id)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'billing_reactivate', entity_type: 'school', entity_id: school_id,
    meta: { school_name: school.name, new_expiry: newExpiry },
  })

  return NextResponse.json({ ok: true, new_expiry: newExpiry })
}

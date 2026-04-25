export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { school_id, days } = await req.json().catch(() => ({}))
  if (!school_id || typeof days !== 'number' || days < 1 || days > 730) {
    return NextResponse.json({ error: 'school_id and days (1-730) required' }, { status: 400 })
  }

  const db = adminClient()

  const { data: school } = await db
    .from('schools')
    .select('id, name, subscription_expires_at')
    .eq('id', school_id)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const current   = new Date(school.subscription_expires_at)
  const base      = current > new Date() ? current : new Date()
  const newExpiry = new Date(base.getTime() + days * 86_400_000).toISOString()

  const { error } = await db
    .from('schools')
    .update({ subscription_expires_at: newExpiry, is_active: true })
    .eq('id', school_id)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id:    auth.ctx.userId,
    actor_email: auth.ctx.email,
    action:      'billing_extend',
    entity_type: 'school',
    entity_id:   school_id,
    meta:        { days, new_expiry: newExpiry, school_name: school.name },
  })

  return NextResponse.json({ ok: true, new_expiry: newExpiry })
}

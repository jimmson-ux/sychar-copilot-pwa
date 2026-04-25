export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { school_id } = await req.json().catch(() => ({}))
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const db = adminClient()

  const { data: school } = await db
    .from('schools')
    .select('id, name')
    .eq('id', school_id)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const { data: staff } = await db
    .from('staff_records')
    .select('user_id, role')
    .eq('school_id', school_id)
    .eq('role', 'principal')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!staff) return NextResponse.json({ error: 'No principal found for school' }, { status: 404 })

  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type:  'magiclink',
    email: (await db.auth.admin.getUserById(staff.user_id)).data.user?.email ?? '',
  })

  if (linkError || !linkData) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  void db.from('god_mode_audit').insert({
    actor_id:    auth.ctx.userId,
    actor_email: auth.ctx.email,
    action:      'impersonate_start',
    entity_type: 'school',
    entity_id:   school_id,
    meta:        { school_name: school.name, target_user: staff.user_id },
  })

  return NextResponse.json({
    ok:          true,
    school_name: school.name,
    magic_link:  linkData.properties?.action_link ?? null,
    expires_at:  new Date(Date.now() + 3600_000).toISOString(),
  })
}

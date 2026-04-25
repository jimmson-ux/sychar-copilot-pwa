export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

const VALID_ROLES    = ['principal', 'deputy', 'teacher', 'bursar', 'librarian', 'nurse', 'admin']
const VALID_SUB_ROLES = ['super_admin', null]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { userId } = await params
  const { role, sub_role } = await req.json().catch(() => ({}))

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Valid: ${VALID_ROLES.join(', ')}` }, { status: 400 })
  }
  if (sub_role !== undefined && !VALID_SUB_ROLES.includes(sub_role)) {
    return NextResponse.json({ error: 'Invalid sub_role' }, { status: 400 })
  }

  const db = adminClient()
  const updates: Record<string, unknown> = {}
  if (role)     updates.role     = role
  if (sub_role !== undefined) updates.sub_role = sub_role

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'role or sub_role required' }, { status: 400 })
  }

  const { error } = await db.from('staff_records').update(updates).eq('user_id', userId)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'user_change_role', entity_type: 'user', entity_id: userId, meta: updates,
  })

  return NextResponse.json({ ok: true })
}

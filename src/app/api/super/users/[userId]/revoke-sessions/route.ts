export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { userId } = await params
  const db = adminClient()

  const { error } = await db.auth.admin.signOut(userId, 'global')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'user_revoke_sessions', entity_type: 'user', entity_id: userId, meta: {},
  })

  return NextResponse.json({ ok: true })
}

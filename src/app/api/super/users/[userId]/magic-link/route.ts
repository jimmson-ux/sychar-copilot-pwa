export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { userId } = await params
  const db = adminClient()

  const { data: userData, error: userError } = await db.auth.admin.getUserById(userId)
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type:  'magiclink',
    email: userData.user.email,
  })

  if (linkError || !linkData) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'user_magic_link', entity_type: 'user', entity_id: userId, meta: { email: userData.user.email },
  })

  return NextResponse.json({ ok: true, magic_link: linkData.properties?.action_link ?? null })
}

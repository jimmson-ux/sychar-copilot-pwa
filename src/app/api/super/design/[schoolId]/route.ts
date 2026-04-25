export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { schoolId } = await params
  const db = adminClient()

  const { data, error } = await db
    .from('schools')
    .select('id, name, theme_color, logo_url, tenant_configs(school_short_code)')
    .eq('id', schoolId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'School not found' }, { status: 404 })
  return NextResponse.json({ school: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { schoolId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const allowed: Record<string, unknown> = {}
  if (typeof body.theme_color === 'string') allowed.theme_color = body.theme_color
  if (typeof body.logo_url    === 'string') allowed.logo_url    = body.logo_url

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const db = adminClient()
  const { error } = await db.from('schools').update(allowed).eq('id', schoolId)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'design_update', entity_type: 'school', entity_id: schoolId, meta: allowed,
  })

  return NextResponse.json({ ok: true })
}

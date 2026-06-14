// Per-school maintenance toggle (Command Centre). Distinct from global_settings (all schools)
// and from billing suspend (schools.is_active). Stored on tenant_configs.features.maintenance_mode
// + features.maintenance_message so a single school can be put behind a lock screen without
// affecting the others. Enforced by /api/school/context.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response
  const { schoolId } = await params

  const db = adminClient()
  const { data } = await db.from('tenant_configs').select('features').eq('school_id', schoolId).maybeSingle()
  const f = (data?.features ?? {}) as { maintenance_mode?: boolean; maintenance_message?: string }
  return NextResponse.json({ maintenance_mode: f.maintenance_mode ?? false, maintenance_message: f.maintenance_message ?? '' })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response
  const { schoolId } = await params

  const body = await req.json().catch(() => null) as { maintenance_mode?: boolean; maintenance_message?: string } | null
  if (!body || typeof body.maintenance_mode !== 'boolean') {
    return NextResponse.json({ error: 'maintenance_mode (boolean) required' }, { status: 400 })
  }

  const db = adminClient()
  const { data: tc } = await db.from('tenant_configs').select('features').eq('school_id', schoolId).maybeSingle()
  if (!tc) return NextResponse.json({ error: 'School not found' }, { status: 404 })
  const features = { ...(tc.features ?? {}), maintenance_mode: body.maintenance_mode, maintenance_message: body.maintenance_message ?? '' }

  const { error } = await db.from('tenant_configs').update({ features }).eq('school_id', schoolId)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'school_maintenance', entity_type: 'school', entity_id: schoolId,
    meta: { maintenance_mode: body.maintenance_mode, message: body.maintenance_message ?? null },
  })

  return NextResponse.json({ ok: true, maintenance_mode: body.maintenance_mode })
}

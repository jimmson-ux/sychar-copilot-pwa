export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { schoolId } = await params
  const db = adminClient()

  const { data: school } = await db
    .from('schools')
    .select('id, name')
    .eq('id', schoolId)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  // Generate a new unique 4-digit code via DB function
  const { data: newCode, error: rpcErr } = await db.rpc('generate_school_short_code')
  if (rpcErr || !newCode) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Upsert tenant_configs — creates row if missing, updates code if exists
  const { error: upsertErr } = await db
    .from('tenant_configs')
    .upsert({ school_id: schoolId, school_short_code: newCode }, { onConflict: 'school_id' })

  if (upsertErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  void db.from('god_mode_audit').insert({
    actor_id:    auth.ctx.userId,
    actor_email: auth.ctx.email,
    action:      'regen_short_code',
    entity_type: 'school',
    entity_id:   schoolId,
    meta:        { school_name: school.name, new_code: newCode },
  })

  return NextResponse.json({ ok: true, short_code: newCode })
}

// PATCH /api/visitors/[id]/checkout — record visitor departure

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'security', 'bursar'])

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db = svc()

  const { data: visitor, error: fetchErr } = await db
    .from('visitor_log')
    .select('id, check_out_time')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !visitor) {
    return NextResponse.json({ error: 'Visitor not found' }, { status: 404 })
  }

  const v = visitor as { id: string; check_out_time: string | null }

  if (v.check_out_time) {
    return NextResponse.json({ error: 'Visitor already checked out' }, { status: 409 })
  }

  const now = new Date().toISOString()

  const { data, error } = await db
    .from('visitor_log')
    .update({ check_out_time: now })
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .select('id, full_name, visitor_name, check_in_time, check_out_time')
    .single()

  if (error) {
    console.error('[visitors/checkout] PATCH error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, visitor: data })
}

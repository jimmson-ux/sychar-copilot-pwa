// POST /api/visitors/[id]/ban — ban a visitor (principal only)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Principal only' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null) as { reason: string } | null

  if (!body?.reason?.trim()) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 })
  }

  const db = svc()

  const { data: visitor, error: fetchErr } = await db
    .from('visitor_log')
    .select('id, full_name, visitor_name, phone, id_number')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !visitor) {
    return NextResponse.json({ error: 'Visitor not found' }, { status: 404 })
  }

  type VisitorRow = { id: string; full_name: string | null; visitor_name: string | null; phone: string | null; id_number: string | null }
  const v = visitor as VisitorRow

  // Update visitor_log record
  await db
    .from('visitor_log')
    .update({ banned: true, ban_reason: body.reason.trim() })
    .eq('id', id)
    .eq('school_id', auth.schoolId!)

  // Add to visitor_bans lookup for future checks
  await db.from('visitor_bans').insert({
    school_id:  auth.schoolId,
    phone:      v.phone ?? null,
    id_number:  v.id_number ?? null,
    reason:     body.reason.trim(),
    banned_by:  auth.userId,
    banned_at:  new Date().toISOString(),
  })

  return NextResponse.json({
    ok:      true,
    banned:  true,
    visitor: v.full_name ?? v.visitor_name,
    reason:  body.reason.trim(),
  })
}

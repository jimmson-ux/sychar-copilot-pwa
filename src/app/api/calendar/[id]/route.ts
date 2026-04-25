// PATCH /api/calendar/[id] — update event (principal/deputy)
// DELETE /api/calendar/[id] — delete event (principal only)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'deputy'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: principal/deputy only' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()
  const body   = await req.json() as {
    title?:       string
    event_date?:  string
    event_time?:  string | null
    category?:    string
    description?: string | null
    audience?:    string
  }

  // Verify event belongs to this school
  const { data: existing } = await db
    .from('school_calendar')
    .select('id')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.title       !== undefined) updates.title       = body.title
  if (body.event_date  !== undefined) updates.event_date  = body.event_date
  if (body.event_time  !== undefined) updates.event_time  = body.event_time
  if (body.category    !== undefined) updates.category    = body.category
  if (body.description !== undefined) updates.description = body.description
  if (body.audience    !== undefined) updates.audience    = body.audience

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await db
    .from('school_calendar')
    .update(updates)
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .select('id, title, event_date, event_time, category, audience')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true, event: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const { id } = await params
  const db = svc()

  const { error } = await db
    .from('school_calendar')
    .delete()
    .eq('id', id)
    .eq('school_id', auth.schoolId!)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

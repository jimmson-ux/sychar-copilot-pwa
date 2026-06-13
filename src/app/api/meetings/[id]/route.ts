import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/meetings/[id] — submit minutes / summary for a general meeting
 * (BOM, staff, PTA, academic, committee — ALL schools). On submission the meeting
 * is marked 'minuted' and the summary is escalated by web push to the principal +
 * deputies. Body: { summary, decisions?, attendees?, status? }
 */
const LEAD = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'dean_of_studies', 'dean_of_students', 'secretary'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { summary?: string; decisions?: string[]; attendees?: string[]; status?: string }
  if (!body.summary?.trim()) return NextResponse.json({ error: 'summary (minutes) is required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  const { data: meeting } = await svc
    .from('meetings')
    .select('id, meeting_type, title, convener_id, minute_taker_id')
    .eq('id', id).eq('school_id', auth.schoolId).maybeSingle()
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()
  const myId = (me as { id: string } | null)?.id
  const m = meeting as { id: string; meeting_type: string; title: string; convener_id: string | null; minute_taker_id: string | null }
  const allowed = LEAD.has(auth.subRole) || myId === m.minute_taker_id || myId === m.convener_id || auth.subRole.startsWith('hod_')
  if (!allowed) return NextResponse.json({ error: 'Only the minute-taker, convener or leadership can submit minutes.' }, { status: 403 })

  const { error } = await svc.from('meetings').update({
    summary: body.summary.trim(),
    decisions: body.decisions ?? [],
    attendees: body.attendees ?? [],
    status: body.status === 'closed' ? 'closed' : 'minuted',
    minuted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('school_id', auth.schoolId)

  if (error) {
    console.error('[meetings/:id] minutes', error)
    return NextResponse.json({ error: 'Failed to save minutes' }, { status: 500 })
  }

  const snippet = body.summary.trim().slice(0, 180)
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      audience: 'role', value: ['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin'],
      school_id: auth.schoolId,
      payload: {
        title: `${m.meeting_type.toUpperCase()} minutes: ${m.title}`,
        body: snippet + (body.summary.trim().length > 180 ? '…' : ''),
        url: '/dashboard/principal', tag: 'meeting-minutes', renotify: true,
      },
    }),
  }).catch(() => {})

  return NextResponse.json({ ok: true, status: 'minuted' })
}

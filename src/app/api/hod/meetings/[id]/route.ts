import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/hod/meetings/[id] — submit the minutes / summary.
 *
 * The delegated minute-taker (or the HOD) records the summary, decisions and
 * attendees. On submission the meeting is marked 'minuted' and the summary is
 * escalated by web push to the deputy principal(s) + principal (all schools).
 *
 * Body: { summary, decisions?: string[], attendees?: string[], status? }
 */
const LEAD = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'dean_of_studies'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { summary?: string; decisions?: string[]; attendees?: string[]; status?: string }
  if (!body.summary?.trim()) return NextResponse.json({ error: 'summary (minutes) is required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  const { data: meeting } = await svc
    .from('department_meetings')
    .select('id, department, title, hod_id, minute_taker_id')
    .eq('id', id).eq('school_id', auth.schoolId).maybeSingle()
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

  // Authorisation: the assigned minute-taker, the HOD, or leadership.
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()
  const myId = (me as { id: string } | null)?.id
  const m = meeting as { id: string; department: string; title: string; hod_id: string | null; minute_taker_id: string | null }
  const allowed = LEAD.has(auth.subRole) || myId === m.minute_taker_id || myId === m.hod_id || auth.subRole.startsWith('hod_')
  if (!allowed) return NextResponse.json({ error: 'Only the minute-taker, HOD or leadership can submit minutes.' }, { status: 403 })

  const { error } = await svc.from('department_meetings').update({
    summary: body.summary.trim(),
    decisions: body.decisions ?? [],
    attendees: body.attendees ?? [],
    status: body.status === 'closed' ? 'closed' : 'minuted',
    minuted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('school_id', auth.schoolId)

  if (error) {
    console.error('[hod/meetings/:id] minutes', error)
    return NextResponse.json({ error: 'Failed to save minutes' }, { status: 500 })
  }

  // Escalate the summary to principal + deputies.
  const snippet = body.summary.trim().slice(0, 180)
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      audience: 'role', value: ['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin'],
      school_id: auth.schoolId,
      payload: {
        title: `${m.department} meeting minutes: ${m.title}`,
        body: snippet + (body.summary.trim().length > 180 ? '…' : ''),
        url: '/dashboard/principal', tag: 'dept-minutes', renotify: true,
      },
    }),
  }).catch(() => {})

  return NextResponse.json({ ok: true, status: 'minuted' })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/hod/meetings — HOD department meetings (all schools).
 *   GET  → meetings for the school (HOD sees own dept; leadership see all)
 *   POST → HOD schedules a meeting, SUMMONS the department by web push, and
 *          delegates minute-taking to a chosen member (who is also pushed).
 *          Body: { title, agenda?, scheduled_at?, location?, minute_taker_id? }
 */
const LEAD = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'dean_of_studies'])
const isHod = (r: string) => r.startsWith('hod_')

function push(schoolId: string, audience: string, value: string | string[], payload: Record<string, unknown>) {
  return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ audience, value, school_id: schoolId, payload }),
  }).catch(() => {})
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const svc = createAdminSupabaseClient()
  let q = svc.from('department_meetings')
    .select('id, department, title, agenda, scheduled_at, location, minute_taker_id, status, summary, minuted_at, created_at')
    .eq('school_id', auth.schoolId)
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .limit(100)

  // HOD (non-leadership) sees only their department.
  if (isHod(auth.subRole) && !LEAD.has(auth.subRole)) {
    const { data: me } = await svc.from('staff_records').select('department').eq('user_id', auth.userId).single()
    if ((me as { department: string } | null)?.department) q = q.eq('department', (me as { department: string }).department)
  }
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Failed to load meetings' }, { status: 500 })
  return NextResponse.json({ meetings: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!isHod(auth.subRole) && !LEAD.has(auth.subRole)) {
    return NextResponse.json({ error: 'Only an HOD (or leadership) can convene a department meeting.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    title?: string; agenda?: string; scheduled_at?: string; location?: string; minute_taker_id?: string; department?: string
  }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const svc = createAdminSupabaseClient()
  const { data: hod } = await svc.from('staff_records').select('id, full_name, department').eq('user_id', auth.userId).single()
  const hodRow = hod as { id: string; full_name: string; department: string | null } | null
  const department = (body.department?.trim() || hodRow?.department || '').trim()
  if (!department) return NextResponse.json({ error: 'No department resolved for your account' }, { status: 400 })

  const { data: meeting, error } = await svc
    .from('department_meetings')
    .insert({
      school_id: auth.schoolId,
      hod_id: hodRow?.id ?? null,
      department,
      title: body.title.trim(),
      agenda: body.agenda ?? null,
      scheduled_at: body.scheduled_at ?? null,
      location: body.location ?? null,
      minute_taker_id: body.minute_taker_id ?? null,
      status: 'scheduled',
    })
    .select('id')
    .single()

  if (error || !meeting) {
    console.error('[hod/meetings] create', error)
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 })
  }
  const meetingId = (meeting as { id: string }).id

  const whenTxt = body.scheduled_at ? new Date(body.scheduled_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'soon'

  // 1) Summon the whole department.
  push(auth.schoolId, 'department', department, {
    title: `Department meeting: ${body.title.trim()}`,
    body: `${hodRow?.full_name ?? 'Your HOD'} has called a ${department} meeting (${whenTxt})${body.location ? ' @ ' + body.location : ''}.`,
    url: '/dashboard/hod', tag: 'dept-meeting', renotify: true,
  })

  // 2) Notify the delegated minute-taker.
  if (body.minute_taker_id) {
    push(auth.schoolId, 'staff', body.minute_taker_id, {
      title: 'You are taking the minutes',
      body: `${hodRow?.full_name ?? 'Your HOD'} asked you to record minutes for "${body.title.trim()}" (${whenTxt}).`,
      url: '/dashboard/hod', tag: 'dept-meeting-minutes', renotify: true,
    })
  }

  return NextResponse.json({ ok: true, meeting_id: meetingId, department })
}

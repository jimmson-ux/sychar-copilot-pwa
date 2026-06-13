import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/** GET /api/secretary/reports — this-month admin counters for the Secretary dashboard. */
const SEC = new Set(['secretary', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  const sid = auth.schoolId
  const monthStart = new Date(Date.now() + 3 * 3600e3); monthStart.setUTCDate(1)
  const since = monthStart.toISOString().slice(0, 10) + 'T00:00:00Z'

  const [visitors, inMail, outMail, meetingsHeld, deliveries, openTasks, notices] = await Promise.all([
    svc.from('visitor_log').select('id', { count: 'exact', head: true }).eq('school_id', sid).gte('check_in_at', since),
    svc.from('secretary_correspondence').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('direction', 'incoming').gte('correspondence_date', since.slice(0, 10)),
    svc.from('secretary_correspondence').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('direction', 'outgoing').gte('correspondence_date', since.slice(0, 10)),
    svc.from('meetings').select('id', { count: 'exact', head: true }).eq('school_id', sid).gte('scheduled_at', since),
    svc.from('school_deliveries').select('id', { count: 'exact', head: true }).eq('school_id', sid).gte('received_at', since),
    svc.from('secretary_tasks').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('status', 'open'),
    svc.from('notices').select('id', { count: 'exact', head: true }).eq('school_id', sid).gte('created_at', since),
  ])

  return NextResponse.json({
    month: since.slice(0, 7),
    visitors: visitors.count ?? 0,
    letters_received: inMail.count ?? 0,
    letters_sent: outMail.count ?? 0,
    meetings: meetingsHeld.count ?? 0,
    deliveries: deliveries.count ?? 0,
    open_tasks: openTasks.count ?? 0,
    announcements: notices.count ?? 0,
  })
}

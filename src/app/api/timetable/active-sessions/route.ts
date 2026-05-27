// GET /api/timetable/active-sessions
// Deputy/principal live view of all active teacher sessions today.
// Returns teacher_attendance_scans for today joined with timetable info.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ADMIN_ROLES = [
  'deputy_principal', 'deputy_principal_academic', 'dean_of_studies',
  'principal', 'super_admin',
]

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ADMIN_ROLES.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = getAdmin()
  const today = new Date().toISOString().slice(0, 10)

  // Heartbeat threshold: sessions with no ping in last 20 min are "dropped"
  const dropThreshold = new Date(Date.now() - 20 * 60 * 1000).toISOString()

  const { data: sessions, error } = await admin
    .from('teacher_attendance_scans')
    .select(`
      id,
      teacher_id,
      teacher_name,
      class_id,
      class_name,
      subject,
      expected_start,
      expected_end,
      scanned_at,
      late_minutes,
      status,
      last_heartbeat_at,
      lesson_completed_at,
      left_early_at,
      left_early_minutes,
      timetable_period_id,
      device_info
    `)
    .eq('school_id', auth.schoolId)
    .eq('scan_date', today)
    .order('scanned_at', { ascending: false })

  if (error) {
    console.error('[active-sessions] fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  // Augment with derived session_state
  const annotated = (sessions ?? []).map((s) => {
    let session_state: 'pending' | 'active' | 'dropped' | 'complete'

    if (s.lesson_completed_at) {
      session_state = 'complete'
    } else if (
      s.last_heartbeat_at &&
      s.last_heartbeat_at < dropThreshold &&
      !s.lesson_completed_at
    ) {
      session_state = 'dropped'
    } else if (s.scanned_at) {
      session_state = 'active'
    } else {
      session_state = 'pending'
    }

    return { ...s, session_state }
  })

  // Summary counts
  const summary = {
    total:    annotated.length,
    active:   annotated.filter((s) => s.session_state === 'active').length,
    dropped:  annotated.filter((s) => s.session_state === 'dropped').length,
    complete: annotated.filter((s) => s.session_state === 'complete').length,
    late:     annotated.filter((s) => s.status === 'late').length,
  }

  return NextResponse.json({ sessions: annotated, summary })
}

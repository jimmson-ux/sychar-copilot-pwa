// GET /api/attendance/teacher-presence?date=YYYY-MM-DD
// Principal real-time view: all teachers, their current lesson, and check-in status.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const VIEWER_ROLES = new Set([
  'principal',
  'deputy_principal',
  'deputy_principal_admin',
  'deputy_principal_academics',
  'deputy_principal_academic',
])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!VIEWER_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — principal or deputy only' }, { status: 403 })
  }

  const dateParam = req.nextUrl.searchParams.get('date')
  const date = dateParam ?? new Date().toISOString().slice(0, 10)

  const db = createAdminSupabaseClient()

  // Day name for timetable lookup
  const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })

  // All active teaching staff
  const { data: staffList } = await db
    .from('staff_records')
    .select('id, full_name, teacher_initials, sub_role, profile_photo_url')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)
    .not('sub_role', 'in', '(principal,deputy_principal,deputy_principal_admin,deputy_principal_academics,deputy_principal_academic,bursar,librarian,counselor)')

  if (!staffList?.length) {
    return NextResponse.json({ presence: [], date, summary: { total: 0, checked_in: 0, missed: 0, no_lesson: 0 } })
  }

  // All timetable entries for today
  const { data: todayEntries } = await db
    .from('timetable')
    .select('id, teacher_id, class_name, subject, period_number, start_time, end_time, room_name')
    .eq('school_id', auth.schoolId)
    .ilike('day', dayName)
    .eq('is_active', true)

  // All lesson sessions for today
  const { data: todaySessions } = await db
    .from('lesson_sessions')
    .select('id, teacher_id, timetable_entry_id, session_status, checkin_time, compliance_score')
    .eq('school_id', auth.schoolId)
    .eq('date', date)

  // Latest heartbeat per teacher
  const { data: recentBeats } = await db
    .from('lesson_heartbeats')
    .select('teacher_id, timestamp, within_geofence')
    .eq('school_id', auth.schoolId)
    .gte('timestamp', `${date}T00:00:00`)
    .order('timestamp', { ascending: false })

  const latestBeatByTeacher = new Map<string, { timestamp: string; within_geofence: boolean }>()
  for (const beat of (recentBeats ?? [])) {
    const tid = String(beat.teacher_id)
    if (!latestBeatByTeacher.has(tid)) {
      latestBeatByTeacher.set(tid, {
        timestamp:      beat.timestamp as string,
        within_geofence: beat.within_geofence as boolean,
      })
    }
  }

  // Build presence rows
  const presence = staffList.map(teacher => {
    const tid = teacher.id
    const teacherEntries = (todayEntries ?? []).filter(
      (e: { teacher_id: string }) => String(e.teacher_id) === String(tid)
    )
    const teacherSessions = (todaySessions ?? []).filter(
      (s: { teacher_id: string }) => String(s.teacher_id) === String(tid)
    )
    const heartbeat = latestBeatByTeacher.get(String(tid))

    // Current or next lesson (closest period to now)
    const nowTime = new Date().toTimeString().slice(0, 5)
    const currentEntry = teacherEntries.find(
      (e: { start_time: string; end_time: string }) =>
        e.start_time <= nowTime && e.end_time >= nowTime
    ) ?? teacherEntries.find(
      (e: { start_time: string }) => e.start_time > nowTime
    ) ?? null

    const currentSession = currentEntry
      ? teacherSessions.find(
          (s: { timetable_entry_id: string }) => s.timetable_entry_id === currentEntry.id
        ) ?? null
      : null

    // Aggregate daily compliance
    const completedSessions = teacherSessions.filter(
      (s: { session_status: string; compliance_score: number | null }) =>
        s.session_status === 'completed' && s.compliance_score != null
    )
    const avgCompliance = completedSessions.length
      ? Math.round(
          completedSessions.reduce(
            (sum: number, s: { compliance_score: number }) => sum + s.compliance_score, 0
          ) / completedSessions.length
        )
      : null

    return {
      teacher_id:        tid,
      full_name:         teacher.full_name,
      initials:          teacher.teacher_initials,
      photo_url:         teacher.profile_photo_url,
      total_lessons:     teacherEntries.length,
      checked_in_count:  teacherSessions.filter((s: { session_status: string }) => ['checked_in','completed'].includes(s.session_status)).length,
      missed_count:      teacherSessions.filter((s: { session_status: string }) => s.session_status === 'missed').length,
      avg_compliance:    avgCompliance,
      current_lesson:    currentEntry ? {
        class_name:   currentEntry.class_name,
        subject:      currentEntry.subject,
        period_number: currentEntry.period_number,
        start_time:   currentEntry.start_time,
        end_time:     currentEntry.end_time,
        room_name:    currentEntry.room_name,
        status:       currentSession?.session_status ?? 'pending',
        checkin_time: currentSession?.checkin_time ?? null,
      } : null,
      last_heartbeat:    heartbeat ?? null,
    }
  })

  const summary = {
    total:      staffList.length,
    checked_in: presence.filter(p => p.current_lesson?.status === 'checked_in').length,
    missed:     presence.filter(p => p.current_lesson?.status === 'missed').length,
    no_lesson:  presence.filter(p => !p.current_lesson).length,
  }

  return NextResponse.json({ presence, date, summary })
}

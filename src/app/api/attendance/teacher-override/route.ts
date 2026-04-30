// POST /api/attendance/teacher-override
// Principal / deputy marks a missed lesson as overridden (excused absence)
// or creates an override session where no check-in record exists.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const OVERRIDE_ROLES = new Set([
  'principal',
  'deputy_principal',
  'deputy_principal_admin',
  'deputy_principal_academics',
  'deputy_principal_academic',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!OVERRIDE_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — principal or deputy only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    // Option A: override an existing session
    session_id?: string
    // Option B: create an override for a timetable entry with no session
    timetable_entry_id?: string
    date?: string
    reason: string
  }

  const { session_id, timetable_entry_id, date, reason } = body

  if (!reason?.trim()) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // ── Option A: existing session ───────────────────────────────────────────
  if (session_id) {
    const { data: session } = await db
      .from('lesson_sessions')
      .select('id, school_id, session_status')
      .eq('id', session_id)
      .eq('school_id', auth.schoolId)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { error } = await db
      .from('lesson_sessions')
      .update({
        session_status:  'overridden',
        override_by:     auth.userId,
        override_reason: reason.trim(),
        is_active:       false,
      })
      .eq('id', session_id)

    if (error) return NextResponse.json({ error: 'Override failed' }, { status: 500 })
    return NextResponse.json({ ok: true, session_id })
  }

  // ── Option B: create override session from timetable entry ────────────────
  if (!timetable_entry_id || !date) {
    return NextResponse.json(
      { error: 'Either session_id OR (timetable_entry_id + date) is required' },
      { status: 400 }
    )
  }

  const { data: entry } = await db
    .from('timetable')
    .select('id, school_id, class_name, subject, period_number, start_time, end_time, teacher_id, teacher_name')
    .eq('id', timetable_entry_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!entry) {
    return NextResponse.json({ error: 'Timetable entry not found' }, { status: 404 })
  }

  // Check if a session already exists for this entry+date
  const { data: existing } = await db
    .from('lesson_sessions')
    .select('id')
    .eq('timetable_entry_id', timetable_entry_id)
    .eq('date', date)
    .limit(1)
    .single()

  let sessionId: string

  if (existing) {
    await db
      .from('lesson_sessions')
      .update({
        session_status:  'overridden',
        override_by:     auth.userId,
        override_reason: reason.trim(),
        is_active:       false,
      })
      .eq('id', existing.id)
    sessionId = existing.id
  } else {
    const { data: created, error } = await db
      .from('lesson_sessions')
      .insert({
        school_id:          auth.schoolId,
        teacher_id:         (entry.teacher_id as string) ?? '',
        class_name:         entry.class_name,
        subject:            entry.subject,
        date,
        period:             entry.period_number,
        start_time:         entry.start_time ? String(entry.start_time) : null,
        end_time:           entry.end_time   ? String(entry.end_time)   : null,
        timetable_entry_id: timetable_entry_id,
        session_status:     'overridden',
        override_by:        auth.userId,
        override_reason:    reason.trim(),
        is_active:          false,
      })
      .select('id')
      .single()

    if (error || !created) {
      return NextResponse.json({ error: 'Failed to create override session' }, { status: 500 })
    }
    sessionId = created.id
  }

  return NextResponse.json({ ok: true, session_id: sessionId })
}

// GET /api/timetable/current-lesson
// Returns the teacher's timetable entry that covers the current time.
// Also attaches the next topic from lesson_plans if available.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()

  // Resolve staff_records.id (uuid) from auth.userId (Supabase auth uid)
  const { data: staff } = await db
    .from('staff_records')
    .select('id, full_name, sub_role')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!staff) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  // Call DB function to resolve current lesson
  const { data: rows, error } = await db.rpc('get_current_lesson_for_teacher', {
    p_staff_id:  staff.id,
    p_school_id: auth.schoolId,
  })

  if (error) {
    console.error('[current-lesson] rpc error:', error)
    return NextResponse.json({ error: 'Failed to fetch current lesson' }, { status: 500 })
  }

  const lesson = rows?.[0] ?? null

  if (!lesson) {
    return NextResponse.json({ lesson: null, message: 'No active lesson right now' })
  }

  // Attach next topic from lesson_plans (latest submitted/approved plan for this class+subject)
  const { data: plan } = await db
    .from('lesson_plans')
    .select('topic, sub_topic, specific_outcomes')
    .eq('school_id', auth.schoolId)
    .eq('class_name', lesson.class_name)
    .eq('subject_name', lesson.subject)
    .in('status', ['submitted', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Check if already checked in today
  const { data: existingSession } = await db
    .from('lesson_sessions')
    .select('id, session_status, checkin_time')
    .eq('timetable_entry_id', lesson.entry_id)
    .eq('date', new Date().toISOString().slice(0, 10))
    .limit(1)
    .single()

  return NextResponse.json({
    lesson: {
      ...lesson,
      next_topic:   plan?.topic ?? null,
      next_subtopic: plan?.sub_topic ?? null,
      outcomes:     plan?.specific_outcomes ?? null,
    },
    session: existingSession ?? null,
  })
}

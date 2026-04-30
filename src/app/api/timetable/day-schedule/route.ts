// GET /api/timetable/day-schedule?date=YYYY-MM-DD
// Returns the authenticated teacher's full schedule for a given day,
// with live session status for each lesson.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const dateParam = req.nextUrl.searchParams.get('date')
  const date = dateParam ?? new Date().toISOString().slice(0, 10)

  const db = createAdminSupabaseClient()

  const { data: staff } = await db
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!staff) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  const { data: schedule, error } = await db.rpc('get_teacher_day_schedule', {
    p_staff_id:  staff.id,
    p_school_id: auth.schoolId,
    p_date:      date,
  })

  if (error) {
    console.error('[day-schedule] rpc error:', error)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }

  // Compute summary counts
  const lessons = schedule ?? []
  const summary = {
    total:       lessons.length,
    checked_in:  lessons.filter((l: { session_status: string }) => l.session_status === 'checked_in').length,
    completed:   lessons.filter((l: { session_status: string }) => l.session_status === 'completed').length,
    missed:      lessons.filter((l: { session_status: string }) => l.session_status === 'missed').length,
    pending:     lessons.filter((l: { session_status: string | null }) => !l.session_status || l.session_status === 'pending').length,
  }

  return NextResponse.json({ schedule: lessons, summary, date })
}

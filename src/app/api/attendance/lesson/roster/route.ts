// GET /api/attendance/lesson/roster?class_name=&session_id=&date=
// Returns the class roster pre-populated with any existing attendance records
// for that session/date so teachers only need to mark exceptions.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId } = auth
  const { searchParams } = req.nextUrl
  const className = searchParams.get('class_name')
  const sessionId = searchParams.get('session_id')
  const date      = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  if (!className) {
    return NextResponse.json({ error: 'class_name required' }, { status: 400 })
  }

  const db = svc()

  // Fetch all active students in the class
  const { data: students, error: sErr } = await db
    .from('students')
    .select('id, full_name, admission_number, gender')
    .eq('school_id', schoolId!)
    .eq('class_name', className)
    .eq('is_active', true)
    .order('full_name')

  if (sErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Fetch any existing attendance for this session/date
  let existingQuery = db
    .from('lesson_student_attendance')
    .select('student_id, status, engagement_level, teacher_note')
    .eq('school_id', schoolId!)
    .eq('class_name', className)
    .eq('lesson_date', date)

  if (sessionId) existingQuery = existingQuery.eq('lesson_session_id', sessionId)

  const { data: existing } = await existingQuery

  const existingMap: Record<string, { status: string; engagement_level: string | null; teacher_note: string | null }> = {}
  for (const row of (existing ?? [])) {
    existingMap[(row as { student_id: string; status: string; engagement_level: string | null; teacher_note: string | null }).student_id] = row as { status: string; engagement_level: string | null; teacher_note: string | null }
  }

  const roster = (students ?? []).map(s => {
    const existing = existingMap[(s as { id: string }).id]
    return {
      student_id:       (s as { id: string }).id,
      student_name:     (s as { full_name: string }).full_name,
      admission_no:     (s as { admission_number: string | null }).admission_number,
      gender:           (s as { gender: string | null }).gender,
      status:           existing?.status ?? 'present',
      engagement_level: existing?.engagement_level ?? 'normal',
      teacher_note:     existing?.teacher_note ?? null,
      already_marked:   !!existing,
    }
  })

  return NextResponse.json({ roster, class_name: className, date, session_id: sessionId })
}

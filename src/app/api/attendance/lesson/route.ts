// GET  /api/attendance/lesson?session_id=&date=&class_name=
// POST /api/attendance/lesson — bulk upsert lesson_student_attendance

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

  const { searchParams } = req.nextUrl
  const sessionId  = searchParams.get('session_id')
  const date       = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const className  = searchParams.get('class_name')
  const db         = svc()
  const { schoolId } = auth

  let query = db
    .from('lesson_student_attendance')
    .select('id,student_id,student_name,admission_no,status,engagement_level,teacher_note,submitted_at')
    .eq('school_id', schoolId!)

  if (sessionId)  query = query.eq('lesson_session_id', sessionId)
  if (date)       query = query.eq('lesson_date', date)
  if (className)  query = query.eq('class_name', className)

  const { data, error } = await query.order('student_name')
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ records: data ?? [] })
}

interface AttendanceRow {
  student_id: string
  student_name?: string
  admission_no?: string
  status: 'present' | 'absent' | 'late' | 'excused' | 'suspended'
  engagement_level?: string
  teacher_note?: string
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId, userId } = auth
  const db   = svc()
  const body = await req.json() as {
    session_id?: string
    lesson_date?: string
    class_name: string
    stream_name?: string
    subject_name: string
    records: AttendanceRow[]
  }

  if (!body.class_name || !body.subject_name || !Array.isArray(body.records) || body.records.length === 0) {
    return NextResponse.json({ error: 'class_name, subject_name, and records[] required' }, { status: 400 })
  }

  // Resolve the teacher's staff_records.id (stored as text in lesson_sessions)
  const { data: staff } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', userId!)
    .eq('school_id', schoolId!)
    .maybeSingle()

  const teacherId = staff ? String((staff as { id: string }).id) : null
  const lessonDate = body.lesson_date ?? new Date().toISOString().split('T')[0]

  const rows = body.records.map(r => ({
    school_id:         schoolId,
    lesson_session_id: body.session_id ?? null,
    lesson_date:       lessonDate,
    student_id:        r.student_id,
    student_name:      r.student_name ?? null,
    admission_no:      r.admission_no ?? null,
    teacher_id:        teacherId,
    class_name:        body.class_name,
    stream_name:       body.stream_name ?? null,
    subject_name:      body.subject_name,
    status:            r.status ?? 'present',
    engagement_level:  r.engagement_level ?? 'normal',
    teacher_note:      r.teacher_note ?? null,
    submitted_at:      new Date().toISOString(),
  }))

  const { error } = await db
    .from('lesson_student_attendance')
    .upsert(rows, { onConflict: 'lesson_session_id,student_id' })

  if (error) {
    console.error('[attendance/lesson] upsert error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length })
}

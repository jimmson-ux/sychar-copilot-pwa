// GET   /api/teacher/lesson-session?date=YYYY-MM-DD
// POST  /api/teacher/lesson-session  — start or log a lesson session
// PATCH /api/teacher/lesson-session  — update topic, micro-score, mark complete

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

  const db = svc()
  const { userId, schoolId } = auth
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const { data } = await db
    .from('lesson_sessions')
    .select('id, class_name, subject, date, period, topic_covered, subtopics, micro_score, notes, is_active, check_in_confirmed')
    .eq('school_id', schoolId!)
    .eq('teacher_id', staff.id as string)
    .eq('date', date)
    .order('period')

  return NextResponse.json({ sessions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { userId, schoolId } = auth
  const body = await req.json()

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const row = {
    school_id:         schoolId,
    teacher_id:        staff.id,
    class_name:        body.class_name,
    subject:           body.subject,
    subject_id:        body.subject_id ?? null,
    date:              body.date ?? new Date().toISOString().split('T')[0],
    period:            body.period ?? null,
    start_time:        body.start_time ?? null,
    end_time:          body.end_time ?? null,
    topic_covered:     body.topic_covered ?? null,
    subtopics:         body.subtopics ?? null,
    micro_score:       body.micro_score ?? null,
    notes:             body.notes ?? null,
    is_active:         body.is_active ?? true,
    lat:               body.lat ?? null,
    lng:               body.lng ?? null,
    check_in_confirmed: body.check_in_confirmed ?? false,
  }

  const { data, error } = await db.from('lesson_sessions').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { userId, schoolId } = auth
  const body = await req.json()

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const updates: Record<string, unknown> = {}
  if (body.topic_covered !== undefined)  updates.topic_covered     = body.topic_covered
  if (body.subtopics      !== undefined) updates.subtopics         = body.subtopics
  if (body.micro_score    !== undefined) updates.micro_score       = body.micro_score
  if (body.notes          !== undefined) updates.notes             = body.notes
  if (body.is_active      !== undefined) updates.is_active         = body.is_active
  if (body.end_time       !== undefined) updates.end_time          = body.end_time

  const { error } = await db
    .from('lesson_sessions')
    .update(updates)
    .eq('id', body.id as string)
    .eq('teacher_id', staff.id as string)
    .eq('school_id', schoolId!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

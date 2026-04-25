// GET  /api/teacher/topic-mastery?subject=X&class_name=Y
// POST /api/teacher/topic-mastery  — upsert topic mastery level

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
  const subject    = req.nextUrl.searchParams.get('subject')
  const class_name = req.nextUrl.searchParams.get('class_name')

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  let query = db
    .from('topic_mastery')
    .select('id, topic, subject, class_name, mastery_level, student_count, assessed_at')
    .eq('school_id', schoolId!)
    .eq('teacher_id', staff.id as string)
    .order('assessed_at', { ascending: false })

  if (subject)    query = query.eq('subject', subject)
  if (class_name) query = query.eq('class_name', class_name)

  const { data } = await query.limit(100)
  return NextResponse.json({ mastery: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { userId, schoolId } = auth
  const body = await req.json() as {
    topic: string; subject: string; class_name: string;
    mastery_level: number; student_count?: number; assessed_at?: string
  }

  if (!body.topic || !body.subject || !body.class_name) {
    return NextResponse.json({ error: 'topic, subject, class_name required' }, { status: 400 })
  }
  if (body.mastery_level < 1 || body.mastery_level > 4) {
    return NextResponse.json({ error: 'mastery_level must be 1–4' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  // Upsert by school+teacher+class+subject+topic
  const { data: existing } = await db
    .from('topic_mastery')
    .select('id')
    .eq('school_id', schoolId!)
    .eq('teacher_id', staff.id as string)
    .eq('class_name', body.class_name)
    .eq('subject', body.subject)
    .eq('topic', body.topic)
    .single()

  if (existing) {
    await db.from('topic_mastery').update({
      mastery_level: body.mastery_level,
      student_count: body.student_count ?? 0,
      assessed_at:   body.assessed_at ?? new Date().toISOString().split('T')[0],
    }).eq('id', (existing as { id: string }).id)
    return NextResponse.json({ id: (existing as { id: string }).id, updated: true })
  }

  const { data, error } = await db.from('topic_mastery').insert({
    school_id:     schoolId,
    teacher_id:    staff.id,
    class_name:    body.class_name,
    subject:       body.subject,
    topic:         body.topic,
    mastery_level: body.mastery_level,
    student_count: body.student_count ?? 0,
    assessed_at:   body.assessed_at ?? new Date().toISOString().split('T')[0],
  }).select('id').single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ id: (data as { id: string }).id, created: true })
}

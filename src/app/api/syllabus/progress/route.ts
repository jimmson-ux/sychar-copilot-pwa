import { createClient }              from '@supabase/supabase-js'
import { NextRequest, NextResponse }  from 'next/server'
import { requireAuth }                from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/syllabus/progress — teacher marks a topic as completed/in-progress
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  let body: { topicId: string; classId: string; status: string; notes?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const VALID_STATUS = ['Pending', 'InProgress', 'Completed', 'Skipped']
  if (!VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const admin = getAdmin()

  // Verify topic belongs to this school
  const { data: topic } = await admin
    .from('syllabus_topics')
    .select('id, subject')
    .eq('id', body.topicId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  const { data, error } = await admin
    .from('syllabus_progress')
    .upsert({
      school_id:    auth.schoolId,
      topic_id:     body.topicId,
      class_id:     body.classId,
      teacher_id:   auth.userId,
      status:       body.status,
      completed_at: body.status === 'Completed' ? new Date().toISOString().slice(0, 10) : null,
      notes:        body.notes ?? null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'topic_id,class_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ progress: data })
}

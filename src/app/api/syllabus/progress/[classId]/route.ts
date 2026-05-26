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

// GET /api/syllabus/progress/[classId]
// Returns syllabus_progress joined with topics for a class, grouped by subject.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { classId } = await params
  const admin = getAdmin()

  const { data, error } = await admin
    .from('syllabus_progress')
    .select(`
      id, status, completed_at, teacher_id,
      syllabus_topics!topic_id (
        id, subject, class_level, topic_name, subtopic_name,
        expected_week, expected_term, curriculum_type, sort_order
      ),
      staff_records!teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('class_id', classId)
    .order('syllabus_topics(sort_order)')

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Group by subject and compute coverage %
  const bySubject: Record<string, { total: number; completed: number; topics: typeof data }> = {}
  for (const row of data ?? []) {
    const topic   = row.syllabus_topics as unknown as { subject: string } | null
    const subject = topic?.subject ?? 'Unknown'
    if (!bySubject[subject]) bySubject[subject] = { total: 0, completed: 0, topics: [] }
    bySubject[subject].total++
    if (row.status === 'Completed') bySubject[subject].completed++
    bySubject[subject].topics.push(row)
  }

  const summary = Object.entries(bySubject).map(([subject, s]) => ({
    subject,
    total:     s.total,
    completed: s.completed,
    coverage:  s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
    topics:    s.topics,
  }))

  return NextResponse.json({ classId, summary })
}

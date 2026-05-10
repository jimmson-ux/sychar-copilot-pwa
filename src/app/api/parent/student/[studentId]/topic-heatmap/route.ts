// GET /api/parent/student/[studentId]/topic-heatmap
// Returns per-topic mastery breakdown from subject_performance.
// Parent can only read their own child's data (studentIds check).

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

type HeatmapRow = {
  subject_name:   string
  topic:          string
  attempts:       number
  avg_score:      number | null
  best_score:     number | null
  worst_score:    number | null
  last_assessed:  string
  mastery_level:  'strong' | 'average' | 'weak'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const { studentId } = await params

  if (!parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const svc    = createAdminSupabaseClient()
  const subject = req.nextUrl.searchParams.get('subject') ?? null

  let query = svc
    .from('v_student_topic_heatmap')
    .select('subject_name, topic, attempts, avg_score, best_score, worst_score, last_assessed, mastery_level')
    .eq('student_id', studentId)
    .eq('school_id',  parent.schoolId)
    .order('subject_name')
    .order('avg_score', { ascending: false })

  if (subject) query = query.eq('subject_name', subject)

  const { data, error } = await query

  if (error) {
    console.error('[topic-heatmap]', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Group by subject for easier client-side rendering
  const bySubject = new Map<string, HeatmapRow[]>()
  for (const row of ((data ?? []) as HeatmapRow[])) {
    const arr = bySubject.get(row.subject_name) ?? []
    arr.push(row)
    bySubject.set(row.subject_name, arr)
  }

  const subjects = Array.from(bySubject.entries()).map(([name, topics]) => ({
    subject:        name,
    topics,
    weakTopics:     topics.filter(t => t.mastery_level === 'weak').length,
    avgScore:       topics.length
      ? Math.round(topics.reduce((s, t) => s + (t.avg_score ?? 0), 0) / topics.length)
      : null,
  }))

  return NextResponse.json({ subjects, totalTopics: (data ?? []).length })
}

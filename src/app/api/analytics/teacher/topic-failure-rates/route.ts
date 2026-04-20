// GET /api/analytics/teacher/topic-failure-rates
// Available to: subject_teacher, class_teacher + HOD + above

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { classifyTopicFailureRate } from '@/lib/analytics/gradeUtils'

const ALLOWED_ROLES = new Set([
  'subject_teacher', 'class_teacher', 'bom_teacher',
  'hod_subjects', 'hod_pathways', 'hod_sciences',
  'hod_mathematics', 'hod_languages', 'hod_humanities',
  'hod_applied_sciences',
  'dean_of_studies', 'deputy_principal_academic',
  'deputy_principal_academics', 'principal',
])

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ALLOWED_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp        = req.nextUrl.searchParams
  const subjectId = sp.get('subject_id')
  const classId   = sp.get('class_id')
  const term      = sp.get('term')
  const examType  = sp.get('exam_type')

  if (!subjectId || !classId || !term) {
    return NextResponse.json(
      { error: 'subject_id, class_id, and term are required' },
      { status: 400 },
    )
  }

  const db = admin()

  // ── Fetch mark_breakdowns for this subject/class/exam ─────
  let query = db
    .from('mark_breakdowns')
    .select('topic_tag, question_number, marks_scored, marks_possible, percentage, student_id')
    .eq('school_id', auth.schoolId)
    .eq('subject_id', subjectId)
    .eq('class_id', classId)
    .eq('term', term)

  if (examType) query = query.eq('exam_type', examType)

  const { data: breakdowns, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!breakdowns?.length) {
    return NextResponse.json({
      topic_analysis: [],
      total_students: 0,
      message: 'No topic-level breakdowns found for this exam. Use the enhanced marks entry to get topic data.',
    })
  }

  // ── Get subject + distinct exam date ─────────────────────
  const { data: subject } = await db
    .from('subjects').select('name').eq('id', subjectId).single()

  // ── Group by topic_tag ────────────────────────────────────
  const topicMap = new Map<string, {
    question_number: number
    marks_possible:  number
    scores:          number[]  // percentage per student
  }>()

  for (const row of breakdowns) {
    const key = row.topic_tag
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        question_number: row.question_number,
        marks_possible:  Number(row.marks_possible),
        scores:          [],
      })
    }
    topicMap.get(key)!.scores.push(Number(row.percentage ?? 0))
  }

  const uniqueStudents = new Set(breakdowns.map(r => r.student_id)).size

  const topic_analysis = Array.from(topicMap.entries())
    .map(([topic_tag, data]) => {
      const { scores, question_number, marks_possible } = data
      const n                   = scores.length
      const failed              = scores.filter(s => s < 40).length
      const failure_rate        = parseFloat(((failed / n) * 100).toFixed(2))
      const avg_pct             = parseFloat((scores.reduce((a, b) => a + b, 0) / n).toFixed(2))
      const avg_score           = parseFloat(((avg_pct / 100) * marks_possible).toFixed(2))
      const severity            = classifyTopicFailureRate(failure_rate)

      return {
        topic_tag,
        question_number,
        marks_possible,
        class_average_score:      avg_score,
        class_average_percentage: avg_pct,
        failure_rate,
        students_failed:  failed,
        students_passed:  n - failed,
        severity,
        revision_priority: 0, // set below
      }
    })
    .sort((a, b) => b.failure_rate - a.failure_rate)
    .map((t, i) => ({ ...t, revision_priority: i + 1 }))

  // ── Auto-generate 3-week revision plan ───────────────────
  const critical = topic_analysis.filter(t => t.severity === 'critical').slice(0, 3)
  const needs    = topic_analysis.filter(t => t.severity === 'needs_attention').slice(0, 2)

  const revisionTopics = [...critical, ...needs].slice(0, 3)
  const recommended_revision_plan = revisionTopics.map((t, i) => ({
    week:   `Week ${i + 1}`,
    topic:  t.topic_tag,
    reason: `${t.failure_rate.toFixed(0)}% of students scored below 40% — ${t.severity.replace('_', ' ')} priority`,
  }))

  return NextResponse.json({
    subject_name:   subject?.name ?? '',
    class_id:       classId,
    exam_type:      examType ?? '',
    total_students: uniqueStudents,
    topic_analysis,
    recommended_revision_plan,
  })
}

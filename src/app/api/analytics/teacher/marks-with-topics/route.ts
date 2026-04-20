// POST /api/analytics/teacher/marks-with-topics
// Enhanced marks entry with per-question topic tagging.
// Saves marks + mark_breakdowns, then returns immediate drop alerts.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import {
  classifyDrop,
  suggestAction,
  classifyTopicFailureRate,
} from '@/lib/analytics/gradeUtils'

const TEACHER_ROLES = new Set([
  'subject_teacher', 'class_teacher', 'bom_teacher',
  'hod_subjects', 'hod_pathways', 'hod_sciences',
  'hod_mathematics', 'hod_languages', 'hod_humanities',
  'hod_applied_sciences', 'dean_of_studies', 'principal',
])

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface QuestionSetup {
  question_number: number
  topic_tag:       string
  marks_possible:  number
}

interface QuestionScore {
  question_number: number
  marks_scored:    number
}

interface StudentEntry {
  student_id:      string
  total_score:     number
  question_scores: QuestionScore[]
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!TEACHER_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    subject_id:      string
    class_id:        string
    stream_name?:    string
    term:            string
    academic_year?:  string
    exam_type:       string
    curriculum_type: 'cbe' | '844'
    exam_date?:      string
    question_setup:  QuestionSetup[]
    student_marks:   StudentEntry[]
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    subject_id, class_id, stream_name, term, academic_year,
    exam_type, curriculum_type, question_setup, student_marks,
  } = body

  if (!subject_id || !class_id || !term || !exam_type || !question_setup?.length || !student_marks?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = admin()
  const total_possible = question_setup.reduce((s, q) => s + q.marks_possible, 0)

  // ── 1. Upsert marks table (total scores) ─────────────────
  const marksToUpsert = student_marks.map(sm => ({
    school_id:    auth.schoolId,
    class_id,
    subject_id,
    student_id:   sm.student_id,
    score:        sm.total_score,
    percentage:   total_possible > 0
                    ? parseFloat(((sm.total_score / total_possible) * 100).toFixed(2))
                    : 0,
    exam_type,
    term,
    academic_year: academic_year ?? '',
  }))

  const { error: marksErr } = await db
    .from('marks')
    .upsert(marksToUpsert, {
      onConflict: 'class_id,subject_id,student_id,exam_type,term',
      ignoreDuplicates: false,
    })

  if (marksErr) {
    return NextResponse.json({ error: `Marks save failed: ${marksErr.message}` }, { status: 500 })
  }

  // Fetch inserted mark ids for FK reference
  const { data: insertedMarks } = await db
    .from('marks')
    .select('id, student_id')
    .eq('school_id', auth.schoolId)
    .eq('class_id', class_id)
    .eq('subject_id', subject_id)
    .eq('exam_type', exam_type)
    .eq('term', term)
    .in('student_id', student_marks.map(s => s.student_id))

  const markIdByStudent = new Map(insertedMarks?.map(m => [m.student_id, m.id]) ?? [])

  // ── 2. Insert mark_breakdowns (per question, per student) ─
  const breakdownRows = []
  for (const sm of student_marks) {
    const markId = markIdByStudent.get(sm.student_id)
    for (const qs of question_setup) {
      const qScore = sm.question_scores.find(q => q.question_number === qs.question_number)
      const scored = qScore?.marks_scored ?? 0
      breakdownRows.push({
        school_id:       auth.schoolId,
        mark_id:         markId ?? null,
        student_id:      sm.student_id,
        subject_id,
        class_id,
        class_name:      '',
        stream_name:     stream_name ?? '',
        term,
        academic_year:   academic_year ?? '',
        exam_type,
        question_number: qs.question_number,
        topic_tag:       qs.topic_tag,
        marks_scored:    scored,
        marks_possible:  qs.marks_possible,
        curriculum_type: curriculum_type ?? '844',
      })
    }
  }

  // Delete stale breakdowns first then insert fresh
  await db
    .from('mark_breakdowns')
    .delete()
    .eq('school_id', auth.schoolId)
    .eq('subject_id', subject_id)
    .eq('class_id', class_id)
    .eq('exam_type', exam_type)
    .eq('term', term)

  const { error: bdErr } = await db
    .from('mark_breakdowns')
    .insert(breakdownRows)

  if (bdErr) {
    console.error('mark_breakdowns insert failed:', bdErr.message)
    // Non-fatal: marks were saved; breakdowns failed
  }

  // ── 3. Check drop alerts ─────────────────────────────────
  const studentIds = student_marks.map(s => s.student_id)

  const { data: prevMarks } = await db
    .from('marks')
    .select('student_id, percentage, score, exam_type, term')
    .eq('school_id', auth.schoolId)
    .eq('class_id', class_id)
    .eq('subject_id', subject_id)
    .in('student_id', studentIds)
    .neq('term', term)
    .order('created_at', { ascending: false })

  const prevByStudent = new Map<string, { percentage: number; term: string }>()
  for (const p of prevMarks ?? []) {
    if (!prevByStudent.has(p.student_id)) {
      prevByStudent.set(p.student_id, {
        percentage: Number(p.percentage ?? p.score ?? 0),
        term:       p.term ?? '',
      })
    }
  }

  const severe_drops = []
  for (const sm of student_marks) {
    const prev = prevByStudent.get(sm.student_id)
    if (!prev) continue
    const currPct = total_possible > 0 ? (sm.total_score / total_possible) * 100 : 0
    const delta   = currPct - prev.percentage
    if (delta < -5) {
      const severity = classifyDrop(delta)
      if (severity === 'severe') {
        severe_drops.push({
          student_id:      sm.student_id,
          delta:           parseFloat(delta.toFixed(2)),
          suggested_action: suggestAction(severity),
        })
      }
    }
  }

  // ── 4. Detect topic gaps ──────────────────────────────────
  const topicScores = new Map<string, number[]>()
  for (const sm of student_marks) {
    for (const qs of question_setup) {
      const qScore = sm.question_scores.find(q => q.question_number === qs.question_number)
      const pct    = qs.marks_possible > 0
        ? ((qScore?.marks_scored ?? 0) / qs.marks_possible) * 100
        : 0
      if (!topicScores.has(qs.topic_tag)) topicScores.set(qs.topic_tag, [])
      topicScores.get(qs.topic_tag)!.push(pct)
    }
  }

  const topic_gaps_detected = Array.from(topicScores.entries())
    .map(([topic_tag, scores]) => {
      const failed       = scores.filter(s => s < 40).length
      const failure_rate = parseFloat(((failed / scores.length) * 100).toFixed(2))
      const severity     = classifyTopicFailureRate(failure_rate)
      return { topic_tag, failure_rate, severity }
    })
    .filter(t => t.severity !== 'good')
    .sort((a, b) => b.failure_rate - a.failure_rate)

  return NextResponse.json({
    marks_saved:          student_marks.length,
    drop_alerts_found:    severe_drops.length,
    severe_drops,
    topic_gaps_detected,
  })
}

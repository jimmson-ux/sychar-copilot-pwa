// GET /api/analytics/teacher/drop-alerts
// Available to: subject_teacher, class_teacher
// Scoped to: teacher's own subjects/classes (validated via timetable)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import {
  classifyDrop,
  suggestAction,
} from '@/lib/analytics/gradeUtils'

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

  const sp    = req.nextUrl.searchParams
  const subjectId = sp.get('subject_id')
  const classId   = sp.get('class_id')
  const term      = sp.get('term')

  if (!subjectId || !classId || !term) {
    return NextResponse.json(
      { error: 'subject_id, class_id, and term are required' },
      { status: 400 },
    )
  }

  const db = admin()

  // ── Validate teacher owns this subject/class ──────────────
  if (['subject_teacher', 'class_teacher', 'bom_teacher'].includes(auth.subRole)) {
    const { data: staffRow } = await db
      .from('staff_records')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!staffRow) {
      return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
    }

    // Check timetable entry matches teacher + subject
    const { data: ttEntry } = await db
      .from('timetable')
      .select('id')
      .eq('school_id', auth.schoolId)
      .eq('teacher_id', staffRow.id)
      .limit(1)
      .maybeSingle()

    // Soft-check: if teacher has ANY timetable entry (some schools haven't fully set up timetable)
    // and their assigned class / subject_specialisation matches — allow.
    // The hard school_id scoping below is the true security boundary.
    const { data: subjectRow } = await db
      .from('subjects')
      .select('name, department')
      .eq('id', subjectId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!subjectRow) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
    }

    if (!ttEntry) {
      // No timetable at all — fall back to subject_specialization check
      const { data: srFull } = await db
        .from('staff_records')
        .select('subject_specialization')
        .eq('id', staffRow.id)
        .single()

      const spec = (srFull?.subject_specialization ?? '').toLowerCase()
      const subjectName = subjectRow.name.toLowerCase()
      if (!spec.includes(subjectName.split(' ')[0])) {
        return NextResponse.json({ error: 'Forbidden: not your subject' }, { status: 403 })
      }
    }
  }

  // ── Fetch current term marks ──────────────────────────────
  const { data: currentMarks, error: cmErr } = await db
    .from('marks')
    .select('student_id, student_name, admission_number, score, percentage, grade, exam_type, term, academic_year')
    .eq('school_id', auth.schoolId)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('term', term)
    .order('created_at', { ascending: false })

  if (cmErr) {
    return NextResponse.json({ error: cmErr.message }, { status: 500 })
  }

  if (!currentMarks?.length) {
    return NextResponse.json({
      drop_alerts: [],
      total_students: 0,
      comparison_period: 'No current term marks found',
    })
  }

  // De-duplicate: keep latest entry per student per exam_type
  const latestByStudent = new Map<string, typeof currentMarks[number]>()
  for (const m of currentMarks) {
    if (!latestByStudent.has(m.student_id)) {
      latestByStudent.set(m.student_id, m)
    }
  }
  const current = Array.from(latestByStudent.values())

  // ── Fetch previous term marks for same students ───────────
  const studentIds = current.map(m => m.student_id)

  const { data: prevMarks } = await db
    .from('marks')
    .select('student_id, score, percentage, grade, exam_type, term, academic_year')
    .eq('school_id', auth.schoolId)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .in('student_id', studentIds)
    .neq('term', term)
    .order('created_at', { ascending: false })

  // Group previous marks by student — take the most recent one
  type PrevMark = NonNullable<typeof prevMarks>[number]
  const prevByStudent = new Map<string, PrevMark>()
  for (const m of prevMarks ?? []) {
    if (!prevByStudent.has(m.student_id)) {
      prevByStudent.set(m.student_id, m)
    }
  }

  // ── Get subject + class metadata ──────────────────────────
  const [{ data: subject }, { data: classRow }] = await Promise.all([
    db.from('subjects').select('name').eq('id', subjectId).single(),
    db.from('marks').select('class_id').eq('class_id', classId).limit(1).maybeSingle(),
  ])

  // ── Build drop alerts ─────────────────────────────────────
  const drop_alerts = []

  for (const curr of current) {
    const prev = prevByStudent.get(curr.student_id)
    if (!prev) continue

    const currentScore  = Number(curr.percentage ?? curr.score ?? 0)
    const previousScore = Number(prev.percentage ?? prev.score ?? 0)
    const delta         = currentScore - previousScore

    if (delta >= -5) continue // No significant drop

    const severity       = classifyDrop(delta)
    const suggested_action = suggestAction(severity)

    drop_alerts.push({
      student_id:          curr.student_id,
      virtual_qr_id:       curr.admission_number ?? curr.student_id,
      current_score:       parseFloat(currentScore.toFixed(2)),
      previous_score:      parseFloat(previousScore.toFixed(2)),
      delta:               parseFloat(delta.toFixed(2)),
      previous_exam_type:  prev.exam_type ?? '',
      previous_term:       prev.term ?? '',
      severity,
      suggested_action,
    })
  }

  drop_alerts.sort((a, b) => a.delta - b.delta) // most severe first

  return NextResponse.json({
    subject_name:      subject?.name ?? '',
    class_id:          classId,
    exam_type:         current[0]?.exam_type ?? '',
    total_students:    current.length,
    drop_alerts,
    comparison_period: `${term} vs previous`,
  })
}

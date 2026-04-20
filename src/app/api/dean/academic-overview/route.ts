// GET /api/dean/academic-overview
// Returns full academic picture for Dean of Studies.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const DEAN_ROLES = ['dean_of_studies', 'deputy_dean_of_studies', 'principal']

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId, subRole } = auth

  if (!DEAN_ROLES.includes(subRole)) {
    return NextResponse.json({ error: 'Dean role required' }, { status: 403 })
  }

  const db = serviceClient()
  const today = new Date().toISOString().slice(0, 10)

  // Fetch school settings for term dates
  const { data: settings } = await db
    .from('school_settings')
    .select('current_term, current_academic_year')
    .eq('school_id', schoolId)
    .single()

  const currentTerm = (settings as { current_term?: string | null } | null)?.current_term ?? '1'
  const currentYear = (settings as { current_academic_year?: string | null } | null)?.current_academic_year ?? String(new Date().getFullYear())

  const [
    teachersRes,
    rowRes,
    schemesRes,
    complianceRes,
    performanceRes,
    invigilationRes,
    clinicsRes,
  ] = await Promise.all([
    db.from('staff_records')
      .select('id, full_name, sub_role, department')
      .eq('school_id', schoolId)
      .eq('is_active', true),
    db.from('records_of_work')
      .select('teacher_id, week_number, was_taught, term, academic_year')
      .eq('school_id', schoolId)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear),
    db.from('schemes_of_work_new')
      .select('id, teacher_id, subject_name, class_name, term, academic_year, status, hod_comment, approved_at')
      .eq('school_id', schoolId)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear),
    db.from('document_compliance')
      .select('teacher_id, compliance_score, scheme_submitted, lesson_plan_submitted, record_of_work_current')
      .eq('school_id', schoolId),
    db.from('subject_performance')
      .select('student_id, class_name, subject_name, score, exam_type, term, academic_year')
      .eq('school_id', schoolId)
      .eq('class_name', 'Form 4')
      .eq('term', currentTerm)
      .eq('academic_year', currentYear),
    db.from('invigilation_chart')
      .select('id, exam_name, exam_date, session, subject_name, venue, invigilator_id, is_confirmed')
      .eq('school_id', schoolId)
      .gte('exam_date', today)
      .order('exam_date', { ascending: true })
      .limit(20),
    db.from('academic_clinics')
      .select('*')
      .eq('school_id', schoolId)
      .in('status', ['planned', 'notified'])
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const teachers = (teachersRes.data ?? []) as {
    id: string; full_name: string; sub_role: string; department: string | null
  }[]

  // ── Syllabus velocity per teacher ──────────────────────────
  const rowData = (rowRes.data ?? []) as {
    teacher_id: string; week_number: number; was_taught: boolean
  }[]

  // Current week number (rough: weeks since Jan 1)
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const currentWeek = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)

  const teacherRowMap: Record<string, { taught: number; totalWeeks: number }> = {}
  for (const row of rowData) {
    if (!teacherRowMap[row.teacher_id]) {
      teacherRowMap[row.teacher_id] = { taught: 0, totalWeeks: 0 }
    }
    if (row.was_taught) teacherRowMap[row.teacher_id].taught++
    teacherRowMap[row.teacher_id].totalWeeks = Math.max(
      teacherRowMap[row.teacher_id].totalWeeks,
      row.week_number
    )
  }

  const syllabusVelocity = teachers.map(t => {
    const stats = teacherRowMap[t.id]
    const taught = stats?.taught ?? 0
    // Expected: currentWeek * 5 lessons/week default
    const expected = Math.max(1, currentWeek * 5)
    const pct = Math.min(100, Math.round((taught / expected) * 100))
    return {
      teacherId: t.id,
      teacherName: t.full_name,
      department: t.department,
      taughtLessons: taught,
      expectedLessons: expected,
      velocityPct: pct,
      status: pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red',
    }
  })

  // ── Schemes of work counts per teacher ──────────────────────
  const schemesData = (schemesRes.data ?? []) as {
    id: string; teacher_id: string; subject_name: string; class_name: string;
    status: string; hod_comment: string | null; approved_at: string | null
  }[]

  const schemesByTeacher: Record<string, Record<string, number>> = {}
  for (const s of schemesData) {
    if (!schemesByTeacher[s.teacher_id]) {
      schemesByTeacher[s.teacher_id] = { submitted: 0, approved: 0, rejected: 0, draft: 0 }
    }
    schemesByTeacher[s.teacher_id][s.status] = (schemesByTeacher[s.teacher_id][s.status] ?? 0) + 1
  }

  const submittedSchemes = schemesData.filter(s => s.status === 'submitted')

  // ── Compliance ──────────────────────────────────────────────
  const complianceData = (complianceRes.data ?? []) as {
    teacher_id: string; compliance_score: number;
    scheme_submitted: boolean; lesson_plan_submitted: boolean; record_of_work_current: boolean
  }[]

  // ── KCSE predictions (Form 4 subject averages) ───────────────
  const perfData = (performanceRes.data ?? []) as {
    student_id: string; subject_name: string; score: number
  }[]

  const subjectScores: Record<string, number[]> = {}
  for (const p of perfData) {
    if (!subjectScores[p.subject_name]) subjectScores[p.subject_name] = []
    subjectScores[p.subject_name].push(p.score)
  }

  const kcsePredictions = Object.entries(subjectScores).map(([subject, scores]) => ({
    subject,
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    studentCount: scores.length,
  })).sort((a, b) => b.averageScore - a.averageScore)

  return NextResponse.json({
    currentTerm,
    currentYear,
    syllabusVelocity,
    schemesByTeacher,
    submittedSchemes,
    complianceScores: complianceData,
    kcsePredictions,
    upcomingExams: invigilationRes.data ?? [],
    academicClinics: clinicsRes.data ?? [],
  })
}

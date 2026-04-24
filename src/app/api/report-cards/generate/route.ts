// POST /api/report-cards/generate
// Generates report cards for a class/stream, calling the generate-pdf edge function
// for each student. Returns { studentId, pdfUrl }[] for all students processed.
// Roles: principal, dean_of_studies, deputy_principal_academics, class_teacher.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import {
  calculateGrade844, calculateMeanGrade844,
  calculateGradeCBC,  calculateMeanGradeCBC,
} from '@/lib/analytics/gradeUtils'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set([
  'principal', 'dean_of_studies', 'deputy_principal_academics',
  'deputy_principal', 'class_teacher', 'form_teacher',
])

function isCBC(className: string): boolean {
  const upper = className.toUpperCase()
  // Grade 7–9 (Junior School) and Grade 10–12 (Senior School) are CBC
  return /GRADE\s*\d+/.test(upper) || /GR\.?\s*\d+/.test(upper)
}

function conductFromIncidents(incidents: number): string {
  if (incidents === 0) return 'Excellent'
  if (incidents <= 2)  return 'Good'
  if (incidents <= 5)  return 'Fair'
  return 'Poor'
}

type StudentRow = {
  id: string
  full_name: string
  admission_number: string | null
  class_name: string | null
  stream_name: string | null
  gender: string | null
}

type MarkRow = {
  subject_name: string
  score: number
  max_score: number
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: principal, dean, or class teacher only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    classId?: string
    streamId?: string
    examType: string
    term: string
    academicYear: string
  } | null

  if (!body?.examType || !body.term || !body.academicYear) {
    return NextResponse.json({ error: 'examType, term, academicYear required' }, { status: 400 })
  }

  const db = svc()

  // Fetch students
  let studentQuery = db
    .from('students')
    .select('id, full_name, admission_number, class_name, stream_name, gender')
    .eq('school_id', auth.schoolId!)
    .eq('is_active', true)

  if (body.classId)  studentQuery = studentQuery.eq('class_id', body.classId)
  if (body.streamId) studentQuery = studentQuery.eq('stream_id', body.streamId)

  const { data: students, error: studErr } = await studentQuery.order('full_name')
  if (studErr) {
    console.error('[report-cards/generate] students:', studErr.message)
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
  if (!students?.length) {
    return NextResponse.json({ error: 'No students found for this class/stream' }, { status: 404 })
  }

  const allStudents = students as StudentRow[]
  const studentIds = allStudents.map(s => s.id)

  // Fetch marks for all students in one query
  const { data: allMarks } = await db
    .from('marks')
    .select('student_id, subject_name, score, max_score')
    .eq('school_id', auth.schoolId!)
    .in('student_id', studentIds)
    .eq('term', body.term)
    .eq('academic_year', body.academicYear)
    .eq('exam_type', body.examType)

  // Fetch attendance for all students
  const { data: allAttendance } = await db
    .from('attendance_records')
    .select('student_id, status')
    .eq('school_id', auth.schoolId!)
    .in('student_id', studentIds)
    .eq('academic_year', body.academicYear)
    .eq('term', Number(body.term))

  // Fetch discipline incidents count per student this term
  const { data: allDiscipline } = await db
    .from('discipline_records')
    .select('student_id')
    .eq('school_id', auth.schoolId!)
    .in('student_id', studentIds)
    .eq('term', body.term)
    .eq('academic_year', body.academicYear)

  // Fetch school + tenant info
  const { data: tenant } = await db
    .from('tenant_configs')
    .select('name, settings')
    .eq('school_id', auth.schoolId!)
    .single()

  type TenantRow = { name: string; settings: Record<string, unknown> }
  const t = tenant as TenantRow | null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const results: { studentId: string; pdfUrl: string | null; error?: string }[] = []

  // Compute class ranks
  type StudentSummary = { studentId: string; totalPoints: number }
  const summaries: StudentSummary[] = []

  for (const student of allStudents) {
    const marks = ((allMarks ?? []) as Array<{ student_id: string } & MarkRow>)
      .filter(m => m.student_id === student.id)

    const subjects = marks.map(m => {
      const pct = m.max_score > 0 ? Math.round((m.score / m.max_score) * 100) : 0
      if (isCBC(student.class_name ?? '')) {
        const g = calculateGradeCBC(pct)
        return { name: m.subject_name, score: pct, grade: g.grade_code, points: g.points, remarks: g.level }
      } else {
        const g = calculateGrade844(pct)
        return { name: m.subject_name, score: pct, grade: g.grade, points: g.points, remarks: '' }
      }
    })

    const totalPoints = subjects.reduce((s, sub) => s + sub.points, 0)
    summaries.push({ studentId: student.id, totalPoints })
  }

  summaries.sort((a, b) => b.totalPoints - a.totalPoints)
  const rankMap = Object.fromEntries(summaries.map((s, i) => [s.studentId, i + 1]))

  for (const student of allStudents) {
    const marks = ((allMarks ?? []) as Array<{ student_id: string } & MarkRow>)
      .filter(m => m.student_id === student.id)

    const useCBC = isCBC(student.class_name ?? '')

    const subjects = marks.map(m => {
      const pct = m.max_score > 0 ? Math.round((m.score / m.max_score) * 100) : 0
      if (useCBC) {
        const g = calculateGradeCBC(pct)
        return { name: m.subject_name, score: pct, grade: g.grade_code, points: g.points, remarks: g.level }
      } else {
        const g = calculateGrade844(pct)
        return { name: m.subject_name, score: pct, grade: g.grade, points: g.points, remarks: '' }
      }
    })

    const subjectPoints = subjects.map(s => s.points)
    const mean = useCBC
      ? calculateMeanGradeCBC(subjectPoints)
      : calculateMeanGrade844(subjectPoints)

    // Attendance
    type AttRow = { student_id: string; status: string }
    const att = ((allAttendance ?? []) as AttRow[]).filter(a => a.student_id === student.id)
    const presentCount = att.filter(a => a.status === 'present').length
    const totalDays    = att.length

    // Discipline
    type DiscRow = { student_id: string }
    const discCount = ((allDiscipline ?? []) as DiscRow[]).filter(d => d.student_id === student.id).length

    const classRank  = rankMap[student.id] ?? 0
    const totalPoints = subjects.reduce((s, sub) => s + sub.points, 0)

    const cardData = {
      curriculum:     useCBC ? 'CBC' : '844',
      schoolName:     t?.name ?? 'Secondary School',
      knecCode:       (t?.settings?.['knec_code'] as string) ?? '',
      student: {
        name:          student.full_name,
        admissionNo:   student.admission_number ?? '',
        className:     student.class_name ?? '',
        stream:        student.stream_name ?? '',
        gender:        student.gender ?? '',
      },
      term:           body.term,
      academicYear:   body.academicYear,
      examType:       body.examType,
      subjects,
      totalPoints,
      average:        subjectPoints.length > 0
        ? Math.round(subjectPoints.reduce((a, b) => a + b, 0) / subjectPoints.length * 10) / 10
        : 0,
      meanGrade:      'mean_grade' in mean ? mean.mean_grade : mean.mean_level,
      classRank,
      streamRank:     classRank,
      attendance: { present: presentCount, total: totalDays, percentage: totalDays > 0 ? Math.round(presentCount / totalDays * 100) : 0 },
      discipline: { incidents: discCount, conduct: conductFromIncidents(discCount) },
    }

    const docType = useCBC ? 'report_card_cbc' : 'report_card_844'

    try {
      const edgeRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ docType, data: cardData }),
      })

      if (!edgeRes.ok) {
        results.push({ studentId: student.id, pdfUrl: null, error: 'PDF generation failed' })
        continue
      }

      const edgeJson = await edgeRes.json() as { success: boolean; url?: string }
      results.push({ studentId: student.id, pdfUrl: edgeJson.url ?? null })
    } catch (e) {
      console.error('[report-cards/generate] edge error:', e)
      results.push({ studentId: student.id, pdfUrl: null, error: 'Network error' })
    }
  }

  const successful = results.filter(r => r.pdfUrl).length
  return NextResponse.json({
    ok: true,
    total: allStudents.length,
    successful,
    failed: allStudents.length - successful,
    results,
  })
}

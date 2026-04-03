import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/teacher/progress?term=Term+1&year=2026
// Returns per-teacher completion stats for HOD/principal dashboard
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { searchParams } = new URL(request.url)
  const term = searchParams.get('term') ?? 'Term 1'
  const year = parseInt(searchParams.get('year') ?? '2026', 10)

  const sb = getClient()

  // Fetch all teachers
  const { data: teachers } = await sb
    .from('users')
    .select('id, full_name, subject_specialization, assigned_class_name')
    .eq('school_id', auth.schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true)

  if (!teachers || teachers.length === 0) {
    return NextResponse.json({ teachers: [] })
  }

  const teacherIds = teachers.map(t => t.id)

  // Records of work count per teacher this term
  const { data: rowCounts } = await sb
    .from('records_of_work')
    .select('teacher_id')
    .eq('school_id', auth.schoolId)
    .eq('term', term)
    .in('teacher_id', teacherIds)

  // Scheme of work existence per teacher this term
  const { data: schemes } = await sb
    .from('schemes_of_work_new')
    .select('teacher_id')
    .eq('school_id', auth.schoolId)
    .eq('term', term)
    .eq('year', year)
    .in('teacher_id', teacherIds)

  // Exam scores count per teacher this term
  const { data: examCounts } = await sb
    .from('subject_performance')
    .select('teacher_id')
    .eq('school_id', auth.schoolId)
    .eq('term', term)
    .in('teacher_id', teacherIds)

  const rowMap = new Map<string, number>()
  for (const r of rowCounts ?? []) {
    rowMap.set(r.teacher_id, (rowMap.get(r.teacher_id) ?? 0) + 1)
  }

  const schemeSet = new Set((schemes ?? []).map(s => s.teacher_id))

  const examMap = new Map<string, number>()
  for (const e of examCounts ?? []) {
    examMap.set(e.teacher_id, (examMap.get(e.teacher_id) ?? 0) + 1)
  }

  const result = teachers.map(t => ({
    teacherId:    t.id,
    teacherName:  t.full_name,
    subjectName:  t.subject_specialization,
    className:    t.assigned_class_name,
    rowsRecorded: rowMap.get(t.id) ?? 0,
    hasScheme:    schemeSet.has(t.id),
    examStudents: examMap.get(t.id) ?? 0,
  }))

  return NextResponse.json({ term, year, teachers: result })
}

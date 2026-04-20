// GET /api/hod/overview
// Returns department-scoped academic data for HOD dashboards.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SUB_ROLE_TO_DEPT: Record<string, string> = {
  hod_sciences:        'Sciences',
  hod_mathematics:     'Mathematics',
  hod_languages:       'Languages',
  hod_humanities:      'Humanities',
  hod_applied_sciences:'Applied Sciences',
  hod_games_sports:    'Games & Sports',
}

const LAB_ROLES = new Set(['hod_sciences', 'hod_applied_sciences'])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth

  if (!subRole.startsWith('hod_')) {
    return NextResponse.json({ error: 'HOD role required' }, { status: 403 })
  }

  const db = serviceClient()

  // Resolve department from staff_records first, then fall back to sub_role mapping
  const { data: staffRow } = await db
    .from('staff_records')
    .select('department, id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .single()

  const department =
    (staffRow as { department?: string | null } | null)?.department?.trim() ||
    SUB_ROLE_TO_DEPT[subRole] ||
    'Unknown'

  // Fetch department_codes to get subjects list for this dept
  const { data: deptCode } = await db
    .from('department_codes')
    .select('subjects')
    .eq('school_id', schoolId)
    .eq('department', department)
    .single()

  const deptSubjects: string[] = (deptCode as { subjects?: string[] } | null)?.subjects ?? []

  // Fetch school settings
  const { data: settings } = await db
    .from('school_settings')
    .select('current_term, current_academic_year')
    .eq('school_id', schoolId)
    .single()

  const currentTerm = (settings as { current_term?: string | null } | null)?.current_term ?? '1'
  const currentYear = (settings as { current_academic_year?: string | null } | null)?.current_academic_year ?? String(new Date().getFullYear())

  // Fetch dept teachers (staff in same department)
  const { data: deptStaff } = await db
    .from('staff_records')
    .select('id, full_name, sub_role, department')
    .eq('school_id', schoolId)
    .eq('department', department)
    .eq('is_active', true)

  const deptTeacherIds = (deptStaff ?? []).map((s: { id: string }) => s.id)

  const [
    schemesRes,
    performanceRes,
    complianceRes,
  ] = await Promise.all([
    // Schemes for subjects in this department
    db.from('schemes_of_work_new')
      .select('id, teacher_id, subject_name, class_name, status, hod_comment, approved_at, created_at')
      .eq('school_id', schoolId)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear)
      .in('subject_name', deptSubjects.length > 0 ? deptSubjects : ['__none__']),

    // Subject performance for dept subjects
    db.from('subject_performance')
      .select('subject_name, score, class_name, term, academic_year')
      .eq('school_id', schoolId)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear)
      .in('subject_name', deptSubjects.length > 0 ? deptSubjects : ['__none__']),

    // Compliance for dept teachers
    deptTeacherIds.length > 0
      ? db.from('document_compliance')
          .select('teacher_id, compliance_score, scheme_submitted, lesson_plan_submitted, record_of_work_current')
          .eq('school_id', schoolId)
          .in('teacher_id', deptTeacherIds)
      : Promise.resolve({ data: [] }),
  ])

  const schemesData = (schemesRes.data ?? []) as {
    id: string; teacher_id: string; subject_name: string; class_name: string;
    status: string; hod_comment: string | null; approved_at: string | null; created_at: string
  }[]

  const pendingSchemes = schemesData.filter(s => s.status === 'submitted')

  // Subject performance averages
  const perfData = (performanceRes.data ?? []) as { subject_name: string; score: number }[]
  const subjectScores: Record<string, number[]> = {}
  for (const p of perfData) {
    if (!subjectScores[p.subject_name]) subjectScores[p.subject_name] = []
    subjectScores[p.subject_name].push(p.score)
  }
  const departmentPerformance = Object.entries(subjectScores)
    .map(([subject, scores]) => ({
      subject,
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    }))
    .sort((a, b) => a.average - b.average) // worst first

  const complianceData = (complianceRes.data ?? []) as {
    teacher_id: string; compliance_score: number;
    scheme_submitted: boolean; lesson_plan_submitted: boolean; record_of_work_current: boolean
  }[]

  // Join compliance with teacher names
  const staffMap = Object.fromEntries(
    (deptStaff ?? []).map((s: { id: string; full_name: string }) => [s.id, s.full_name])
  )
  const teacherCompliance = complianceData.map(c => ({
    ...c,
    teacherName: staffMap[c.teacher_id] ?? 'Unknown',
  }))

  const labEquipmentNote = LAB_ROLES.has(subRole)
    ? 'Request lab consumables and equipment via the Requisitions panel below.'
    : null

  return NextResponse.json({
    department,
    deptSubjects,
    departmentPerformance,
    pendingSchemes,
    allSchemes: schemesData,
    teacherCompliance,
    deptStaff: deptStaff ?? [],
    labEquipmentNote,
    currentTerm,
    currentYear,
  })
}

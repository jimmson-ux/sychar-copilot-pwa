// GET  /api/schemes — list schemes (teacher=own, HOD=department, admin=all)
// POST /api/schemes — create new scheme with status='draft'

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const TEACHER_ROLES = new Set(['teacher', 'class_teacher', 'form_teacher', 'subject_teacher'])
const HOD_ROLES     = new Set(['hod', 'deputy_hod', 'senior_teacher'])
const ADMIN_ROLES   = new Set([
  'principal', 'dean_of_studies', 'deputy_principal_academics', 'deputy_principal',
])

type StaffRow = { id: string; department: string | null }

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allRoles = new Set([...TEACHER_ROLES, ...HOD_ROLES, ...ADMIN_ROLES])
  if (!allRoles.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db   = svc()
  const { searchParams } = req.nextUrl
  const term = searchParams.get('term')
  const year = searchParams.get('year') ?? String(new Date().getFullYear())

  let query = db
    .from('schemes_of_work_new')
    .select(`
      id, subject_name, class_name, form_level, term, academic_year,
      status, hod_comment, created_at, updated_at,
      staff_records!teacher_id ( full_name, department )
    `)
    .eq('school_id', auth.schoolId!)
    .eq('academic_year', year)
    .order('created_at', { ascending: false })
    .limit(100)

  if (term) query = query.eq('term', Number(term))

  if (TEACHER_ROLES.has(auth.subRole)) {
    const { data: staff } = await db
      .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
    if (staff) query = query.eq('teacher_id', (staff as StaffRow).id)
  } else if (HOD_ROLES.has(auth.subRole)) {
    const { data: staff } = await db
      .from('staff_records').select('id, department').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
    if (staff) {
      const dept = (staff as StaffRow).department
      if (dept) {
        const { data: deptTeachers } = await db
          .from('staff_records').select('id').eq('school_id', auth.schoolId!).eq('department', dept)
        const ids = ((deptTeachers ?? []) as StaffRow[]).map(t => t.id)
        if (ids.length > 0) query = query.in('teacher_id', ids)
      }
    }
  }
  // ADMIN_ROLES see all — no additional filter

  const { data, error } = await query
  if (error) {
    console.error('[schemes] GET error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ schemes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allRoles = new Set([...TEACHER_ROLES, ...HOD_ROLES, ...ADMIN_ROLES])
  if (!allRoles.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    subjectName:    string
    className:      string
    streamName?:    string
    term:           number
    academicYear:   string
    weeklyPlan:     unknown[]
    referenceBooks?: unknown[]
    weeksPerTerm?:  number
    lessonsPerWeek?: number
  } | null

  if (!body?.subjectName || !body.className || !body.term || !body.academicYear || !body.weeklyPlan) {
    return NextResponse.json(
      { error: 'subjectName, className, term, academicYear, weeklyPlan required' },
      { status: 400 }
    )
  }

  const db = svc()

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record found' }, { status: 403 })

  const { data, error } = await db
    .from('schemes_of_work_new')
    .insert({
      school_id:        auth.schoolId,
      teacher_id:       (staff as StaffRow).id,
      subject_name:     body.subjectName,
      class_name:       body.className,
      form_level:       body.streamName ?? null,
      term:             body.term,
      academic_year:    body.academicYear,
      weekly_plan:      body.weeklyPlan,
      reference_books:  body.referenceBooks ?? [],
      weeks_per_term:   body.weeksPerTerm   ?? 13,
      lessons_per_week: body.lessonsPerWeek ?? 5,
      status:           'draft',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[schemes] POST error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 201 })
}

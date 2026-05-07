// GET  /api/hod/subject-assignments — returns dept teachers + existing assignments
// POST /api/hod/subject-assignments — saves HOD's subject→teacher assignments
// DELETE /api/hod/subject-assignments — soft-deletes one assignment (is_active=false)
//
// NO assignments are made automatically. The HOD specifies everything manually.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const HOD_ROLES = new Set([
  'hod_sciences','hod_mathematics','hod_languages',
  'hod_humanities','hod_applied_sciences','hod_games_sports',
  'hod_arts','hod_social_sciences','hod_technical','hod_pathways',
  'principal','deputy_principal','dean_of_studies',
])

const DEPT_SUBJECT_HINTS: Record<string, string[]> = {
  sciences:         ['Biology','Chemistry','Physics','Agriculture'],
  mathematics:      ['Mathematics','Additional Mathematics'],
  languages:        ['English','Kiswahili','French','German'],
  humanities:       ['History & Government','Geography','CRE','IRE','Business Studies','Economics'],
  applied_sciences: ['Physics','Computer Studies','Technical Drawing','Building Construction','Electricity'],
  games_sports:     ['Physical Education','CRE','Art & Design','Music','Home Science'],
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!HOD_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — HOD role required' }, { status: 403 })
  }

  const db = createAdminSupabaseClient()

  const { data: myRecord } = await db
    .from('staff_records')
    .select('id,department')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  const dept = myRecord?.department ?? null

  const { data: teachers } = await db
    .from('staff_records')
    .select('id,full_name,email,sub_role,assigned_class,subject_specialization')
    .eq('school_id', auth.schoolId)
    .eq('department', dept)
    .eq('is_active', true)
    .order('full_name')

  const { data: existing } = await db
    .from('teacher_subject_assignments')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('department', dept)
    .eq('is_active', true)

  const assignmentComplete = (existing?.length ?? 0) > 0

  return NextResponse.json({
    department:           dept,
    teachers:             teachers ?? [],
    existing_assignments: existing ?? [],
    subject_suggestions:  DEPT_SUBJECT_HINTS[dept ?? ''] ?? [],
    assignment_complete:  assignmentComplete,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!HOD_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    assignments?: Array<{
      teacher_id: string
      subject_name: string
      curriculum_type: string
      class_levels: string[]
    }>
  }

  if (!body.assignments?.length) {
    return NextResponse.json({ error: 'assignments array required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  const { data: myRecord } = await db
    .from('staff_records')
    .select('id,department,full_name')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  const month = new Date().getMonth() + 1
  const term  = month <= 4 ? 1 : month <= 8 ? 2 : 3
  const year  = String(new Date().getFullYear())

  const rows = body.assignments.map(a => ({
    school_id:               auth.schoolId,
    teacher_id:              a.teacher_id,
    subject_name:            a.subject_name,
    department:              myRecord?.department ?? null,
    curriculum_type:         a.curriculum_type ?? 'both',
    class_levels:            a.class_levels ?? [],
    term,
    academic_year:           `${year}/${parseInt(year)+1}`,
    is_active:               true,
    is_principal_teaching:   false,
    is_hod_for_this_subject: false,
  }))

  const { error } = await db
    .from('teacher_subject_assignments')
    .upsert(rows, { onConflict: 'school_id,teacher_id,subject_name,term,academic_year' })

  if (error) {
    console.error('[hod/subject-assignments POST]', error.message)
    return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
  }

  try {
    await db.from('system_logs').insert({
      school_id: auth.schoolId,
      level:     'info',
      category:  'hod_assignment',
      message:   `${myRecord?.full_name} assigned ${rows.length} subject(s)`,
      user_id:   auth.userId,
    })
  } catch { /* non-critical */ }

  return NextResponse.json({ success: true, saved: rows.length })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!HOD_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { assignment_id } = await req.json().catch(() => ({})) as { assignment_id?: string }
  if (!assignment_id) {
    return NextResponse.json({ error: 'assignment_id required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()
  const { error } = await db
    .from('teacher_subject_assignments')
    .update({ is_active: false })
    .eq('id', assignment_id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 })
  return NextResponse.json({ success: true })
}

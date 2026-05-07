// GET /api/teacher/subject-context
// Returns the calling staff member's teaching context:
//   has_teaching: true if they have any teacher_subject_assignments
//   subjects: list of subjects they teach
//   assigned_class: their homeroom class (if class_teacher)
//   staff_id: their staff_records.id (needed for other API calls)
//
// Used by every dashboard to detect dual-role staff and show
// the "My Lessons" section where relevant.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALWAYS_TEACHING = new Set([
  'class_teacher','subject_teacher',
  'form_principal_form4','form_principal_grade10',
])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()

  const { data: staff } = await db
    .from('staff_records')
    .select('id,full_name,sub_role,assigned_class,department,is_form_principal')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!staff) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  const { data: assignments } = await db
    .from('teacher_subject_assignments')
    .select('subject_name,department,curriculum_type,class_levels,is_hod_for_this_subject')
    .eq('teacher_id', staff.id)
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)

  const hasAssignments = (assignments?.length ?? 0) > 0
  const hasTeaching    = ALWAYS_TEACHING.has(staff.sub_role) || hasAssignments

  const { data: todaySlots } = await db
    .from('timetable')
    .select('id,period_number,subject_name,class_name,stream_name,day_of_week,start_time,end_time')
    .eq('school_id', auth.schoolId)
    .eq('teacher_id', staff.id)
    .order('period_number')

  return NextResponse.json({
    staff_id:       staff.id,
    full_name:      staff.full_name,
    sub_role:       staff.sub_role,
    assigned_class: staff.assigned_class ?? null,
    department:     staff.department ?? null,
    is_form_principal: staff.is_form_principal ?? false,
    has_teaching:   hasTeaching,
    subjects:       assignments ?? [],
    timetable_slots: todaySlots ?? [],
  })
}

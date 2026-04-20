import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const staffId = req.nextUrl.searchParams.get('staff_id')
  if (!staffId) {
    return NextResponse.json({ error: 'staff_id required' }, { status: 400 })
  }

  const SCHOOL_ID = auth.schoolId

  const admin = getAdmin()
  const today = new Date().toISOString().split('T')[0]
  const twoWeeksAhead = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [staffRes, rowRes, complianceRes, dutiesRes, appraisalsRes, timetableRes] = await Promise.allSettled([
    admin
      .from('staff_records')
      .select('id, full_name, email, phone, sub_role, department, subject_specialization, assigned_class_name, tsc_number, photo_url')
      .eq('id', staffId)
      .eq('school_id', SCHOOL_ID)
      .single(),

    admin
      .from('records_of_work')
      .select('id, duty_date, topic, sub_topic, period, classwork_given, homework_assigned, created_at')
      .eq('teacher_id', staffId)
      .order('created_at', { ascending: false })
      .limit(5),

    admin
      .from('document_compliance')
      .select('compliance_score, has_scheme, lesson_plans_count, row_count, updated_at')
      .eq('teacher_id', staffId)
      .eq('school_id', SCHOOL_ID)
      .order('updated_at', { ascending: false })
      .limit(1),

    admin
      .from('duty_assignments')
      .select('id, duty_date, duty_type, time_slot, post, remarks')
      .eq('teacher_id', staffId)
      .eq('school_id', SCHOOL_ID)
      .gte('duty_date', thirtyDaysAgo)
      .lte('duty_date', twoWeeksAhead)
      .order('duty_date', { ascending: true }),

    admin
      .from('appraisals')
      .select('id, duty_date, punctuality, incident_handling, report_quality, student_welfare, overall_rating, duty_notes, graded_via, created_at')
      .eq('appraisee_id', staffId)
      .eq('school_id', SCHOOL_ID)
      .order('created_at', { ascending: false })
      .limit(3),

    admin
      .from('timetable')
      .select('id, day, period, subject, subject_code, teacher_initials, room, class_name')
      .eq('school_id', SCHOOL_ID)
      .order('period', { ascending: true }),
  ])

  const staff = staffRes.status === 'fulfilled' ? staffRes.value.data : null
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  // Filter timetable to this teacher's entries
  let todaysTimetable: unknown[] = []
  if (timetableRes.status === 'fulfilled' && timetableRes.value.data) {
    const allEntries = timetableRes.value.data
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const name = (staff.full_name || '').split(' ').map((p: string) => p[0]).join('').slice(0, 3).toUpperCase()
    todaysTimetable = allEntries.filter((e: { day: string; teacher_initials?: string }) =>
      e.day === todayName &&
      e.teacher_initials?.toUpperCase().includes(name.slice(0, 2))
    )
  }

  // Normalise column names so the client sees consistent field names
  const staffOut = staff ? {
    ...staff,
    role: staff.sub_role,
    subject_name: (staff as Record<string, unknown>).subject_specialization ?? '',
    class_name: (staff as Record<string, unknown>).assigned_class_name ?? '',
  } : null

  return NextResponse.json({
    staff: staffOut,
    records_of_work: rowRes.status === 'fulfilled' ? (rowRes.value.data ?? []) : [],
    compliance: complianceRes.status === 'fulfilled' ? (complianceRes.value.data?.[0] ?? null) : null,
    duties: dutiesRes.status === 'fulfilled' ? (dutiesRes.value.data ?? []) : [],
    appraisals: appraisalsRes.status === 'fulfilled' ? (appraisalsRes.value.data ?? []) : [],
    todays_timetable: todaysTimetable,
    today,
  })
}

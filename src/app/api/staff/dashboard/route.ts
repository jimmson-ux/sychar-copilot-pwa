import { NextRequest, NextResponse } from 'next/server'
import { requireStaffAuth } from '@/middleware/verifyStaffJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/staff/dashboard
 * Returns aggregated dashboard data for the authenticated staff member:
 * - Profile (name, role, subject, photo)
 * - School info
 * - Today's timetable entries
 * - Class roster count
 * - Recent attendance summary for their class
 * - Pending marks count
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaffAuth(req)
  if (auth.unauthorized) return auth.unauthorized

  const svc    = createAdminSupabaseClient()
  const today  = new Date().toISOString().slice(0, 10)
  const dow    = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()]

  // Run all queries in parallel
  const [staffRes, schoolRes, timetableRes, rosterRes, attendanceRes, marksRes] =
    await Promise.all([
      // Staff profile
      svc
        .from('staff_records')
        .select('id, full_name, sub_role, subject_specialization, photo_url, class_id, tsc_number, employment_type, assigned_class')
        .eq('id', auth.staffId)
        .single(),

      // School
      svc
        .from('schools')
        .select('name, logo_url, motto')
        .eq('id', auth.schoolId)
        .single(),

      // Today's timetable (if timetable table exists)
      svc
        .from('timetable_slots')
        .select('id, period_number, start_time, end_time, subject_name, class_name, room')
        .eq('school_id', auth.schoolId)
        .eq('staff_id', auth.staffId)
        .eq('day_of_week', dow)
        .order('period_number'),

      // Roster count for their class
      auth.classId
        ? svc
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', auth.schoolId)
            .eq('class_id', auth.classId)
        : Promise.resolve({ count: null, error: null }),

      // Attendance today for their class
      auth.classId
        ? svc
            .from('attendance_records')
            .select('status')
            .eq('school_id', auth.schoolId)
            .eq('class_id', auth.classId)
            .eq('date', today)
        : Promise.resolve({ data: null, error: null }),

      // Pending marks: subjects where marks haven't been entered this term
      svc
        .from('marks')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', auth.schoolId)
        .eq('teacher_id', auth.staffId)
        .gte('created_at', `${new Date().getFullYear()}-01-01`),
    ])

  type StaffRow = {
    id: string; full_name: string; sub_role: string | null
    subject_specialization: string | null; photo_url: string | null
    class_id: string | null; tsc_number: string | null
    employment_type: string | null; assigned_class: string | null
  }

  const staff  = staffRes.data  as StaffRow | null
  const school = schoolRes.data as { name: string; logo_url: string | null; motto: string | null } | null

  type TimetableSlot = {
    id: string; period_number: number; start_time: string; end_time: string
    subject_name: string; class_name: string; room: string | null
  }
  const timetable = (timetableRes.data ?? []) as TimetableSlot[]

  const rosterCount = (rosterRes as { count: number | null }).count ?? 0

  type AttRow = { status: string }
  const attRows   = (attendanceRes as { data: AttRow[] | null }).data ?? []
  const present   = attRows.filter((r) => r.status?.toLowerCase() === 'present').length
  const absent    = attRows.filter((r) => r.status?.toLowerCase() === 'absent').length
  const marksCount = (marksRes as { count: number | null }).count ?? 0

  return NextResponse.json({
    staff: staff
      ? {
          id:       staff.id,
          name:     staff.full_name,
          role:     staff.sub_role,
          subject:  staff.subject_specialization,
          photoUrl: staff.photo_url,
          classId:  staff.class_id,
          assignedClass: staff.assigned_class,
          tscNumber: staff.tsc_number,
          employmentType: staff.employment_type,
        }
      : null,
    school: school
      ? { name: school.name, logoUrl: school.logo_url, motto: school.motto }
      : null,
    today: {
      date: today,
      dayOfWeek: dow,
      timetable,
      periodCount: timetable.length,
    },
    class: {
      rosterCount,
      attendanceToday: { present, absent, total: attRows.length },
    },
    marks: { totalEntered: marksCount },
  })
}

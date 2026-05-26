import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'
import { requireAuth }   from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/timetable/gaps
// Returns uncovered timetable slots for today (teacher absent, no cover assigned yet).
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const DEPUTY_ROLES = [
    'deputy_principal','deputy_principal_academic','dean_of_studies','principal','super_admin',
  ]
  if (!DEPUTY_ROLES.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin   = getAdmin()
  const today   = new Date().toISOString().slice(0, 10)
  const jsDay   = new Date().getDay()
  const dow     = jsDay === 0 ? 1 : jsDay === 6 ? 5 : jsDay

  // Teachers absent today
  const { data: absences } = await admin
    .from('teacher_absences')
    .select('teacher_id, absence_type, cover_status, staff_records!teacher_id(full_name)')
    .eq('school_id', auth.schoolId)
    .eq('absence_date', today)

  if (!absences?.length) return NextResponse.json({ gaps: [] })

  const absentIds = absences.map((a) => a.teacher_id).filter(Boolean)

  // Their slots today that are not covered
  const { data: gaps, error } = await admin
    .from('timetable_periods')
    .select(`
      id, class_id, class_name, subject, teacher_id, teacher_name,
      period_number, start_time, end_time, room, is_covered, covered_by_id
    `)
    .eq('school_id', auth.schoolId)
    .eq('day_of_week', dow)
    .eq('is_active', true)
    .eq('is_covered', false)
    .in('teacher_id', absentIds)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ gaps: gaps ?? [], absences })
}

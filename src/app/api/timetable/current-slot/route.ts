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

// GET /api/timetable/current-slot
// Returns the school_period active right now + all timetable_periods for that period.
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const admin = getAdmin()
  const now   = new Date()
  const hhmm  = now.toTimeString().slice(0, 5)
  const jsDay = now.getDay()
  const dow   = jsDay === 0 ? 1 : jsDay === 6 ? 5 : jsDay

  // Current teaching period
  const { data: period } = await admin
    .from('school_periods')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('is_teaching', true)
    .lte('start_time', hhmm)
    .gte('end_time',   hhmm)
    .order('period_number')
    .limit(1)
    .maybeSingle()

  if (!period) {
    return NextResponse.json({ period: null, slots: [], message: 'No active teaching period.' })
  }

  // All active timetable slots for this period today
  const { data: slots } = await admin
    .from('timetable_periods')
    .select(`
      id, class_id, class_name, subject, teacher_id, teacher_name,
      room, is_covered, covered_by_id, cover_assigned_at,
      staff_records!teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('period_number', period.period_number)
    .eq('day_of_week', dow)
    .eq('is_active', true)

  return NextResponse.json({ period, slots: slots ?? [] })
}

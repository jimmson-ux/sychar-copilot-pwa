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

// GET /api/duty/today
// Returns duty_log entries for today plus duty_rosters for current week.
export async function GET() {
  const auth  = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const admin = getAdmin()
  const today = new Date().toISOString().slice(0, 10)

  // Compute Monday of current week
  const now   = new Date()
  const day   = now.getDay() === 0 ? 6 : now.getDay() - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - day)
  const weekStart = monday.toISOString().slice(0, 10)

  const [logRes, rosterRes] = await Promise.all([
    admin
      .from('duty_log')
      .select(`
        id, duty_type, complexity_weight, duty_date, notes,
        staff_records!teacher_id      ( full_name, sub_role ),
        covering_teacher:staff_records!covering_for_id ( full_name )
      `)
      .eq('school_id', auth.schoolId)
      .eq('duty_date', today)
      .order('duty_type'),

    admin
      .from('duty_rosters')
      .select(`
        id, area, day_of_week, notes, week_starting,
        staff_records!teacher_id ( full_name, sub_role )
      `)
      .eq('school_id', auth.schoolId)
      .eq('week_starting', weekStart),
  ])

  return NextResponse.json({
    date:    today,
    log:     logRes.data  ?? [],
    rosters: rosterRes.data ?? [],
  })
}

import { createClient }         from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }           from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/timetable/week/[teacherId]
// Returns teacher's full week timetable, grouped by day_of_week.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teacherId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { teacherId } = await params

  const admin = getAdmin()
  const { data, error } = await admin
    .from('timetable_periods')
    .select(`
      id, class_id, class_name, subject, day_of_week,
      period_number, start_time, end_time, room,
      is_covered, covered_by_id, cover_assigned_at, is_active,
      school_periods!period_number ( period_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('teacher_id', teacherId)
    .eq('is_active', true)
    .order('day_of_week')
    .order('period_number')

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Group by day
  const byDay: Record<number, typeof data> = {}
  for (const slot of data ?? []) {
    if (!byDay[slot.day_of_week]) byDay[slot.day_of_week] = []
    byDay[slot.day_of_week]!.push(slot)
  }

  return NextResponse.json({ teacherId, timetable: byDay })
}

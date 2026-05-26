import { createClient }              from '@supabase/supabase-js'
import { NextRequest, NextResponse }  from 'next/server'
import { requireAuth }                from '@/lib/requireAuth'
import { findCoverTeacher }           from '@/services/coverAllocation'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/cover/candidates/[slotId]?absentTeacherId=xxx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const ALLOWED = ['deputy_principal','deputy_principal_academic','dean_of_studies','principal','super_admin']
  if (!ALLOWED.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { slotId }        = await params
  const absentTeacherId   = req.nextUrl.searchParams.get('absentTeacherId') ?? ''

  const admin = getAdmin()
  const { data: slot } = await admin
    .from('timetable_periods')
    .select('day_of_week, period_number')
    .eq('id', slotId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  const result = await findCoverTeacher({
    absentTeacherId,
    timetablePeriodId: slotId,
    dayOfWeek:         slot.day_of_week,
    periodNumber:      slot.period_number,
    schoolId:          auth.schoolId,
  })

  return NextResponse.json(result)
}

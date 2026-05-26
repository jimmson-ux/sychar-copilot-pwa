import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }               from '@/lib/requireAuth'
import { assignCover }               from '@/services/coverAllocation'

export const dynamic = 'force-dynamic'

// POST /api/cover/assign
// Body: { timetablePeriodId, coverTeacherId, absentTeacherId, dutyDate, periodNumber }
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const ALLOWED = ['deputy_principal','deputy_principal_academic','dean_of_studies','principal','super_admin']
  if (!ALLOWED.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    timetablePeriodId: string
    coverTeacherId:    string
    absentTeacherId:   string
    dutyDate:          string
    periodNumber:      number
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await assignCover({
    ...body,
    assignedBy: auth.userId,
    schoolId:   auth.schoolId,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/discipline?student_id=xxx
 * Returns discipline records visible to parents.
 * Omits internal staff notes and witness names.
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const { data, error } = await svc
    .from('discipline_records')
    .select('id, incident_date, allegation, action_taken, status, parent_informed, suspension_days')
    .eq('student_id', studentId)
    .eq('school_id', parent.schoolId)
    .order('incident_date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Failed to load discipline records' }, { status: 500 })

  return NextResponse.json({ records: data ?? [] })
}

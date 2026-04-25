// GET /api/parent/student/[studentId]/discipline
// Sanitized view: no teacher names, no internal notes

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const { studentId } = await params

  if (!parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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

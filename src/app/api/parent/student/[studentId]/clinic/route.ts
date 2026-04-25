// GET /api/parent/student/[studentId]/clinic
// Returns nurse visit summaries — visit reason + outcome only, no clinical notes

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
    .from('nurse_visits')
    .select('id, visit_date, presenting_complaint, outcome, referral_needed, follow_up_date')
    .eq('student_id', studentId)
    .eq('school_id', parent.schoolId)
    .order('visit_date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Failed to load clinic records' }, { status: 500 })

  return NextResponse.json({ visits: data ?? [] })
}

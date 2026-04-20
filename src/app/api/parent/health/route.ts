import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/health?student_id=xxx
 * Returns nurse visit summaries for the student.
 * Sensitive clinical notes are EXCLUDED — parents see visit reason + outcome only.
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
    .from('nurse_visits')
    .select('id, visit_date, presenting_complaint, outcome, referral_needed, follow_up_date')
    .eq('student_id', studentId)
    .eq('school_id', parent.schoolId)
    .order('visit_date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Failed to load health records' }, { status: 500 })

  return NextResponse.json({ visits: data ?? [] })
}

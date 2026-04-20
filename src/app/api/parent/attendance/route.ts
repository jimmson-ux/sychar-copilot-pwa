import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/attendance?student_id=xxx&term=1&year=2026
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const p         = req.nextUrl.searchParams
  const studentId = p.get('student_id')
  const term      = p.get('term')      ?? '1'
  const year      = p.get('year')      ?? '2026'

  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const { data, error } = await svc
    .from('attendance_records')
    .select('date, status, remarks')
    .eq('student_id', studentId)
    .eq('school_id', parent.schoolId)
    .eq('term', Number(term))
    .eq('academic_year', year)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 })

  const total   = (data ?? []).length
  const present = (data ?? []).filter((r: { status: string }) => r.status === 'present').length
  const rate    = total ? Math.round((present / total) * 100) : null

  return NextResponse.json({ records: data ?? [], summary: { total, present, rate } })
}

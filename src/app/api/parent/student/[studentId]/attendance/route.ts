// GET /api/parent/student/[studentId]/attendance
// Returns: summary + last 14 days of daily attendance status

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

  const svc     = createAdminSupabaseClient()
  const cutoff  = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: records, error } = await svc
    .from('attendance_records')
    .select('date, status, remarks')
    .eq('student_id', studentId)
    .eq('school_id', parent.schoolId)
    .gte('date', cutoff)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 })

  const rows   = records ?? []
  const total  = rows.length
  const present = rows.filter(r => r.status === 'present').length
  const absent  = rows.filter(r => r.status === 'absent').length
  const late    = rows.filter(r => r.status === 'late').length
  const rate    = total ? Math.round((present / total) * 100) : null

  return NextResponse.json({
    records: rows,
    summary: { total, present, absent, late, rate },
  })
}

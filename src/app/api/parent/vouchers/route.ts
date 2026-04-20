import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/vouchers?student_id=xxx
 * Returns active voucher packages and the student's voucher balance/history.
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const [{ data: packages }, { data: vouchers }] = await Promise.all([
    svc
      .from('voucher_packages')
      .select('id, name, description, price, meals_count, valid_days, is_active')
      .eq('school_id', parent.schoolId)
      .eq('is_active', true)
      .order('price'),
    svc
      .from('bread_vouchers')
      .select('id, package_id, meals_remaining, expires_at, activated_at, status')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('activated_at', { ascending: false })
      .limit(10),
  ])

  return NextResponse.json({ packages: packages ?? [], vouchers: vouchers ?? [] })
}

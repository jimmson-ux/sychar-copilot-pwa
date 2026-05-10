import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/vouchers?student_id=xxx
 * Returns:
 *   - active vouchers for the student (from student_vouchers)
 *   - purchasable products for this school (from voucher_products)
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId || !parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const [{ data: vouchers }, { data: products }] = await Promise.all([
    svc
      .from('student_vouchers')
      .select(
        'id, item_type, item_label, unit_label, qty_remaining, qty_issued, qty_used, valid_from, valid_until, is_active, updated_at',
      )
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .eq('is_active', true)
      .gte('valid_until', new Date().toISOString().slice(0, 10))
      .order('valid_until', { ascending: true }),
    svc
      .from('voucher_products')
      .select('id, item_type, item_label, unit_label, qty, price_kes, valid_days')
      .eq('school_id', parent.schoolId)
      .eq('is_active', true)
      .order('price_kes'),
  ])

  return NextResponse.json({ vouchers: vouchers ?? [], products: products ?? [] })
}

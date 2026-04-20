import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/vouchers/purchase
 * Body: { student_id: string, package_id: string, payment_method: 'wallet' | 'mpesa' }
 * Purchases a bread voucher package. Deducts from wallet or initiates STK push.
 */
export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({}))
  const { student_id, package_id, payment_method } = body as {
    student_id?:      string
    package_id?:      string
    payment_method?:  'wallet' | 'mpesa'
  }

  if (!student_id || !parent.studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }
  if (!package_id) {
    return NextResponse.json({ error: 'package_id is required' }, { status: 400 })
  }
  if (!payment_method || !['wallet', 'mpesa'].includes(payment_method)) {
    return NextResponse.json({ error: 'payment_method must be wallet or mpesa' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Verify package belongs to school and is active
  const { data: pkg } = await svc
    .from('voucher_packages')
    .select('id, name, price, meals_count, valid_days')
    .eq('id', package_id)
    .eq('school_id', parent.schoolId)
    .eq('is_active', true)
    .single()

  if (!pkg) {
    return NextResponse.json({ error: 'Package not found or inactive' }, { status: 404 })
  }

  if (payment_method === 'wallet') {
    // Deduct from wallet atomically
    const { data: wallet } = await svc
      .from('student_wallets')
      .select('id, balance')
      .eq('student_id', student_id)
      .eq('school_id', parent.schoolId)
      .single()

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }
    if ((wallet.balance as number) < (pkg.price as number)) {
      return NextResponse.json(
        { error: `Insufficient balance. Need KES ${pkg.price}, have KES ${wallet.balance}` },
        { status: 422 },
      )
    }

    // Deduct and create voucher in one logical block
    const expiresAt = new Date(Date.now() + (pkg.valid_days as number) * 86400_000).toISOString()

    const [deductResult, voucherResult] = await Promise.all([
      svc.from('student_wallets')
        .update({ balance: (wallet.balance as number) - (pkg.price as number) })
        .eq('id', wallet.id),
      svc.from('bread_vouchers')
        .insert({
          school_id:       parent.schoolId,
          student_id:      student_id,
          package_id:      package_id,
          meals_remaining: pkg.meals_count,
          expires_at:      expiresAt,
          activated_at:    new Date().toISOString(),
          status:          'active',
          paid_via:        'wallet',
        })
        .select('id, meals_remaining, expires_at')
        .single(),
    ])

    if (deductResult.error || voucherResult.error) {
      return NextResponse.json({ error: 'Purchase failed — please retry' }, { status: 500 })
    }

    return NextResponse.json({ voucher: voucherResult.data, payment: 'wallet' }, { status: 201 })
  }

  // M-Pesa path — create pending voucher, initiate STK push
  const ref = `VCH-${Date.now()}`
  const expiresAt = new Date(Date.now() + (pkg.valid_days as number) * 86400_000).toISOString()

  await svc.from('bread_vouchers').insert({
    school_id:       parent.schoolId,
    student_id:      student_id,
    package_id:      package_id,
    meals_remaining: pkg.meals_count,
    expires_at:      expiresAt,
    status:          'pending_payment',
    paid_via:        'mpesa',
    mpesa_reference: ref,
  })

  return NextResponse.json({
    message:   'Proceed to M-Pesa payment',
    reference: ref,
    amount:    pkg.price,
  }, { status: 202 })
}

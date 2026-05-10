import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/vouchers/purchase
 * Body: { student_id, product_id, payment_method: 'wallet' | 'mpesa' }
 *
 * Flow (wallet):
 *   1. Look up voucher_products by product_id → get price, qty, item_type, valid_days
 *   2. Call debit_wallet() RPC  — triggers apply_wallet_transaction() → updates balance
 *   3. Upsert student_vouchers for student + item_type (extending validity if exists)
 *   4. Call issue_vouchers() RPC — triggers apply_voucher_transaction() → updates qty
 *
 * Flow (mpesa):
 *   1. Insert pending record in mpesa_callbacks
 *   2. Initiate STK push → callback handler completes purchase via issue_vouchers()
 */
export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({}))
  const { student_id, product_id, payment_method } = body as {
    student_id?:     string
    product_id?:     string
    payment_method?: 'wallet' | 'mpesa'
  }

  if (!student_id || !parent.studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }
  if (!product_id) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }
  if (!payment_method || !['wallet', 'mpesa'].includes(payment_method)) {
    return NextResponse.json({ error: 'payment_method must be wallet or mpesa' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // ── Verify product belongs to school and is active ─────────────
  const { data: product } = await svc
    .from('voucher_products')
    .select('id, item_type, item_label, unit_label, qty, price_kes, valid_days')
    .eq('id', product_id)
    .eq('school_id', parent.schoolId)
    .eq('is_active', true)
    .single()

  if (!product) {
    return NextResponse.json({ error: 'Product not found or inactive' }, { status: 404 })
  }

  const p = product as {
    id: string; item_type: string; item_label: string; unit_label: string
    qty: number; price_kes: number; valid_days: number
  }

  // ── Wallet payment ─────────────────────────────────────────────
  if (payment_method === 'wallet') {
    const { data: wallet } = await svc
      .from('student_wallets')
      .select('id, balance_kes')
      .eq('student_id', student_id)
      .eq('school_id', parent.schoolId)
      .single()

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }
    if ((wallet.balance_kes as number) < p.price_kes) {
      return NextResponse.json(
        { error: `Insufficient balance. Need KES ${p.price_kes}, have KES ${wallet.balance_kes}` },
        { status: 422 },
      )
    }

    // Debit wallet — trigger handles balance update
    const { error: debitErr } = await svc.rpc('debit_wallet', {
      p_wallet_id:    wallet.id,
      p_amount_kes:   p.price_kes,
      p_description:  `Bought ${p.qty} ${p.item_label} vouchers`,
    })

    if (debitErr) {
      const msg = debitErr.message.toLowerCase()
      if (msg.includes('insufficient') || msg.includes('frozen') || msg.includes('daily')) {
        return NextResponse.json({ error: debitErr.message }, { status: 422 })
      }
      console.error('[vouchers/purchase] debit_wallet error:', debitErr)
      return NextResponse.json({ error: 'Payment failed — please retry' }, { status: 500 })
    }

    // Upsert student_voucher record for this item_type
    const validUntil = new Date(Date.now() + p.valid_days * 86_400_000).toISOString().slice(0, 10)
    const { data: studentData } = await svc
      .from('students')
      .select('full_name, admission_no')
      .eq('id', student_id)
      .single()

    const { data: voucher, error: upsertErr } = await svc
      .from('student_vouchers')
      .upsert(
        {
          school_id:    parent.schoolId,
          student_id:   student_id,
          student_name: (studentData as { full_name: string } | null)?.full_name ?? '',
          admission_no: (studentData as { admission_no: string } | null)?.admission_no ?? null,
          item_type:    p.item_type,
          item_label:   p.item_label,
          unit_label:   p.unit_label,
          valid_from:   new Date().toISOString().slice(0, 10),
          valid_until:  validUntil,
          is_active:    true,
        },
        { onConflict: 'school_id,student_id,item_type,valid_from', ignoreDuplicates: false },
      )
      .select('id, qty_remaining')
      .single()

    if (upsertErr || !voucher) {
      console.error('[vouchers/purchase] voucher upsert error:', upsertErr)
      return NextResponse.json({ error: 'Failed to create voucher record' }, { status: 500 })
    }

    // Issue vouchers via RPC — trigger updates qty_remaining
    const { error: issueErr } = await svc.rpc('issue_vouchers', {
      p_voucher_id:  voucher.id,
      p_qty:         p.qty,
      p_description: `Parent purchase — ${p.qty} ${p.item_label}`,
    })

    if (issueErr) {
      console.error('[vouchers/purchase] issue_vouchers error:', issueErr)
      return NextResponse.json({ error: 'Failed to issue vouchers' }, { status: 500 })
    }

    return NextResponse.json(
      { voucher_id: voucher.id, qty_added: p.qty, valid_until: validUntil, payment: 'wallet' },
      { status: 201 },
    )
  }

  // ── M-Pesa path ────────────────────────────────────────────────
  const ref = `VCH-${Date.now()}`

  await svc.from('mpesa_callbacks').insert({
    school_id:  parent.schoolId,
    student_id: student_id,
    reference:  ref,
    purpose:    'voucher_purchase',
    amount:     p.price_kes,
    status:     'pending',
  })

  return NextResponse.json(
    { message: 'Proceed to M-Pesa payment', reference: ref, amount: p.price_kes, product },
    { status: 202 },
  )
}

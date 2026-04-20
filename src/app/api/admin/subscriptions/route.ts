/**
 * /api/admin/subscriptions
 * Super-admin only — manage school subscription tiers, payment approvals,
 * freeze/unfreeze schools, and platform-wide stats.
 *
 * GET  ?action=list              — all schools + subscription status
 * GET  ?action=stats             — platform stats (MRR, ARR, totals)
 * GET  ?action=queue             — pending payment approvals
 * POST  { action:'approve', approval_id, school_id }
 * POST  { action:'flag',    approval_id, notes }
 * POST  { action:'freeze',  school_id }
 * POST  { action:'unfreeze',school_id }
 * POST  { action:'record_payment', school_id, amount, payment_ref }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { sendWhatsApp } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN_SECRET = process.env.SUPER_ADMIN_SECRET ?? ''

function assertSuperAdmin(req: Request) {
  const auth = req.headers.get('x-super-admin-secret') ?? ''
  if (!auth || auth !== SUPER_ADMIN_SECRET) return false
  return true
}

const TIER_FEE: Record<number, number> = { 1: 45000, 2: 85000, 3: 150000 }

function calcTier(count: number): number {
  if (count <= 200) return 1
  if (count <= 500) return 2
  return 3
}

export async function GET(req: Request) {
  if (!assertSuperAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminSupabaseClient()
  const url    = new URL(req.url)
  const action = url.searchParams.get('action') ?? 'list'

  if (action === 'stats') {
    const { data: subs } = await db
      .from('school_subscriptions')
      .select('status, tier, annual_fee, student_count_at_activation')

    const active    = (subs ?? []).filter(s => s.status === 'active')
    const mrr       = active.reduce((sum, s) => sum + ((s.annual_fee ?? 0) / 12), 0)
    const arr       = active.reduce((sum, s) => sum + (s.annual_fee ?? 0), 0)
    const byStatus  = (subs ?? []).reduce((acc: Record<string, number>, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1; return acc
    }, {})
    const { count: totalStudents } = await db
      .from('students').select('id', { count: 'exact', head: true }).eq('status', 'active')

    return NextResponse.json({
      total_schools: (subs ?? []).length,
      by_status:     byStatus,
      total_active_students: totalStudents ?? 0,
      mrr:  Math.round(mrr),
      arr:  Math.round(arr),
    })
  }

  if (action === 'queue') {
    const { data: approvals } = await db
      .from('payment_approvals')
      .select('*, schools(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    return NextResponse.json({ approvals: approvals ?? [] })
  }

  // Default: list all schools with subscriptions
  const { data: schools } = await db
    .from('schools')
    .select('id, name, county')

  const { data: subs } = await db
    .from('school_subscriptions')
    .select('*')

  const subMap = Object.fromEntries((subs ?? []).map(s => [s.school_id, s]))

  const list = (schools ?? []).map(school => {
    const sub = subMap[school.id] ?? null
    return { ...school, subscription: sub }
  })

  return NextResponse.json({ schools: list })
}

export async function POST(req: Request) {
  if (!assertSuperAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminSupabaseClient()
  const body = await req.json() as {
    action: string
    school_id?: string
    approval_id?: string
    notes?: string
    amount?: number
    payment_ref?: string
  }

  // ── Approve payment ────────────────────────────────────────────────────────
  if (body.action === 'approve') {
    const { data: approval } = await db
      .from('payment_approvals')
      .select('*, schools(id, name)')
      .eq('id', body.approval_id ?? '')
      .single()

    if (!approval) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })

    const school = approval.schools as unknown as { id: string; name: string }

    // Get current student count for tier calculation
    const { count: studentCount } = await db
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('status', 'active')

    const count    = studentCount ?? 0
    const tier     = calcTier(count)
    const annualFee = TIER_FEE[tier]
    const expiry   = new Date()
    expiry.setFullYear(expiry.getFullYear() + 1)

    await Promise.all([
      db.from('payment_approvals').update({
        status:      'approved',
        tier_paid:   tier,
        reviewed_at: new Date().toISOString(),
      }).eq('id', body.approval_id ?? ''),

      db.from('school_subscriptions').upsert({
        school_id:                  school.id,
        status:                     'active',
        tier,
        annual_fee:                 annualFee,
        activated_at:               new Date().toISOString(),
        expiry_date:                expiry.toISOString(),
        payment_ref:                approval.payment_ref,
        student_count_at_activation: count,
      }, { onConflict: 'school_id' }),

      db.from('subscription_events').insert({
        school_id:  school.id,
        event_type: 'payment_approved',
        details:    { amount: approval.amount, tier, expiry: expiry.toISOString() },
      }),
    ])

    // Notify principal
    const { data: principal } = await db
      .from('staff_records')
      .select('phone_number, full_name')
      .eq('school_id', school.id)
      .eq('sub_role', 'principal')
      .single()

    if (principal?.phone_number) {
      sendWhatsApp(principal.phone_number,
        `✅ ${school.name} subscription activated (Tier ${tier}) — valid until ${expiry.toDateString()}. Thank you!`
      ).then(() => {}, () => {})
    }

    return NextResponse.json({ ok: true, tier, expiry: expiry.toISOString() })
  }

  // ── Flag payment ───────────────────────────────────────────────────────────
  if (body.action === 'flag') {
    await db.from('payment_approvals').update({
      status:      'flagged',
      notes:       body.notes ?? '',
      reviewed_at: new Date().toISOString(),
    }).eq('id', body.approval_id ?? '')
    return NextResponse.json({ ok: true })
  }

  // ── Freeze school ──────────────────────────────────────────────────────────
  if (body.action === 'freeze') {
    const schoolId = body.school_id ?? ''
    await Promise.all([
      db.from('school_subscriptions').update({ status: 'frozen' }).eq('school_id', schoolId),
      db.from('subscription_events').insert({
        school_id:  schoolId,
        event_type: 'frozen',
        details:    { reason: 'manual_freeze', by: 'super_admin' },
      }),
    ])

    // Notify principal
    const { data: school } = await db.from('schools').select('name').eq('id', schoolId).single()
    const { data: principal } = await db.from('staff_records')
      .select('phone_number').eq('school_id', schoolId).eq('sub_role', 'principal').single()
    if (principal?.phone_number) {
      sendWhatsApp(principal.phone_number,
        `⚠️ ${school?.name ?? 'Your school'} portal has been suspended. Please contact Sychar support to resolve your subscription.`
      ).then(() => {}, () => {})
    }
    return NextResponse.json({ ok: true })
  }

  // ── Unfreeze school ────────────────────────────────────────────────────────
  if (body.action === 'unfreeze') {
    const schoolId = body.school_id ?? ''
    await Promise.all([
      db.from('school_subscriptions').update({ status: 'active' }).eq('school_id', schoolId),
      db.from('subscription_events').insert({
        school_id:  schoolId,
        event_type: 'unfrozen',
        details:    { by: 'super_admin' },
      }),
    ])

    const { data: principal } = await db.from('staff_records')
      .select('phone_number').eq('school_id', schoolId).eq('sub_role', 'principal').single()
    if (principal?.phone_number) {
      sendWhatsApp(principal.phone_number,
        `✅ Your school portal has been reactivated. Welcome back to Sychar!`
      ).then(() => {}, () => {})
    }
    return NextResponse.json({ ok: true })
  }

  // ── Record incoming payment (creates approval queue entry) ─────────────────
  if (body.action === 'record_payment') {
    const schoolId = body.school_id ?? ''
    const { count: studentCount } = await db
      .from('students').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('status', 'active')

    const count    = studentCount ?? 0
    const tier     = calcTier(count)
    const expected = TIER_FEE[tier]

    await db.from('payment_approvals').insert({
      school_id:       schoolId,
      amount:          body.amount ?? 0,
      payment_ref:     body.payment_ref ?? '',
      expected_amount: expected,
      tier_expected:   tier,
    })

    return NextResponse.json({
      ok: true,
      tier_expected:   tier,
      expected_amount: expected,
      underpayment: (body.amount ?? 0) < expected,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

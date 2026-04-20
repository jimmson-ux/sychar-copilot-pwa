import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/wallet/settings
 * Body: { student_id, low_balance_alert?, auto_topup_enabled?, auto_topup_threshold?, auto_topup_amount? }
 */
export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({}))
  const {
    student_id,
    low_balance_alert,
    auto_topup_enabled,
    auto_topup_threshold,
    auto_topup_amount,
  } = body as {
    student_id?:          string
    low_balance_alert?:   number
    auto_topup_enabled?:  boolean
    auto_topup_threshold?: number
    auto_topup_amount?:   number
  }

  if (!student_id || !parent.studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Invalid student_id' }, { status: 403 })
  }

  const update: Record<string, unknown> = {}
  if (low_balance_alert   !== undefined) update.low_balance_alert   = low_balance_alert
  if (auto_topup_enabled  !== undefined) update.auto_topup_enabled  = auto_topup_enabled
  if (auto_topup_threshold !== undefined) update.auto_topup_threshold = auto_topup_threshold
  if (auto_topup_amount   !== undefined) update.auto_topup_amount   = auto_topup_amount

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No settings provided' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  const { error } = await svc
    .from('student_wallets')
    .update(update)
    .eq('student_id', student_id)
    .eq('school_id', parent.schoolId)

  if (error) return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })

  return NextResponse.json({ updated: true })
}

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

const SAFE_REPAIRS = [
  'purge_expired_otps',
  'purge_old_system_logs',
  'recalculate_fee_balances',
] as const

type RepairJob = typeof SAFE_REPAIRS[number]

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { job } = await req.json().catch(() => ({}))
  if (!job || !SAFE_REPAIRS.includes(job as RepairJob)) {
    return NextResponse.json({ error: `Invalid job. Valid: ${SAFE_REPAIRS.join(', ')}` }, { status: 400 })
  }

  const db = adminClient()
  let result = ''

  if (job === 'purge_expired_otps') {
    const { count } = await db
      .from('auth_rate_limits')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString())
    result = `Deleted ${count ?? 0} expired OTP rows`
  }

  if (job === 'purge_old_system_logs') {
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const { count } = await db
      .from('god_mode_audit')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)
    result = `Deleted ${count ?? 0} log rows older than 90 days`
  }

  if (job === 'recalculate_fee_balances') {
    result = 'Fee balance recalculation scheduled — this runs via DB trigger on next fee write'
  }

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'db_repair', entity_type: 'system', entity_id: null,
    meta: { job, result },
  })

  return NextResponse.json({ ok: true, job, result })
}

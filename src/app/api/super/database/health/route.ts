export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db = adminClient()
  const start = Date.now()

  const TABLES = [
    'schools', 'students', 'staff_records', 'fee_records', 'fee_balances',
    'attendance_records', 'marks_records', 'discipline_cases', 'clinic_visits',
    'parent_messages', 'parent_query_logs', 'system_logs',
  ]

  const counts = await Promise.all(
    TABLES.map(t =>
      db.from(t).select('*', { count: 'exact', head: true })
        .then(r => ({ table: t, count: r.count ?? 0, error: r.error?.message ?? null }))
    )
  )

  const pingMs = Date.now() - start

  const unhealthy = counts.filter(c => c.error !== null)

  return NextResponse.json({
    pingMs,
    status:  unhealthy.length === 0 ? 'healthy' : 'degraded',
    tables:  counts,
    checkedAt: new Date().toISOString(),
  })
}

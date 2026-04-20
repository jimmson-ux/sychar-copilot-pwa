// GET /api/store/burn-rate
// Returns daily consumption rates, days_remaining, and anomaly flags per item.
// Anomaly: actual_daily > expected_daily by >20% for 3+ consecutive days → leakage flag.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()

  // Fetch all active items
  const { data: items } = await db
    .from('inventory_items')
    .select('id, name, unit, current_stock, daily_ration, min_stock')
    .eq('school_id', auth.schoolId!)
    .eq('is_active', true)

  if (!items || items.length === 0) return NextResponse.json({ burn_rates: [] })

  // Fetch student count for expected-daily calculation
  const { count: studentCount } = await db
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', auth.schoolId!)
    .eq('is_active', true)

  const nStudents = studentCount ?? 0

  // Fetch ISSUE logs for last 14 days grouped by item + day
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data: logs } = await db
    .from('inventory_logs')
    .select('item_id, quantity_change, server_timestamp')
    .eq('school_id', auth.schoolId!)
    .eq('transaction_type', 'ISSUE')
    .gte('server_timestamp', since)
    .order('server_timestamp')

  // Group by item_id → by day
  type LogRow = { item_id: string; quantity_change: number; server_timestamp: string }
  const byItem: Record<string, Record<string, number>> = {}
  for (const log of (logs ?? []) as LogRow[]) {
    const day = log.server_timestamp.slice(0, 10)
    if (!byItem[log.item_id]) byItem[log.item_id] = {}
    byItem[log.item_id][day] = (byItem[log.item_id][day] ?? 0) + Math.abs(log.quantity_change)
  }

  type ItemRow = { id: string; name: string; unit: string; current_stock: number; daily_ration: number | null; min_stock: number }

  const burnRates = (items as ItemRow[]).map(item => {
    const dailyMap  = byItem[item.id] ?? {}
    const days      = Object.values(dailyMap)
    const last7Days = days.slice(-7)
    const avgDaily  = last7Days.length > 0
      ? last7Days.reduce((a, b) => a + b, 0) / last7Days.length
      : 0

    const daysRemaining = avgDaily > 0
      ? Math.floor(item.current_stock / avgDaily)
      : null

    const expectedDaily = item.daily_ration != null && nStudents > 0
      ? item.daily_ration * nStudents
      : null

    // Anomaly: last 3 days' consumption > expected by >20%
    const last3  = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-3)
      .map(([, v]) => v)

    let anomaly_flag = false
    if (expectedDaily && expectedDaily > 0 && last3.length >= 3) {
      anomaly_flag = last3.every(v => v > expectedDaily * 1.2)
    }

    return {
      item_id:        item.id,
      name:           item.name,
      unit:           item.unit,
      current_stock:  item.current_stock,
      min_stock:      item.min_stock,
      avg_daily_7d:   Math.round(avgDaily * 100) / 100,
      expected_daily: expectedDaily != null ? Math.round(expectedDaily * 100) / 100 : null,
      days_remaining: daysRemaining,
      alert:          daysRemaining != null && daysRemaining <= 10,
      anomaly_flag,
      daily_breakdown: Object.entries(dailyMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7)
        .map(([date, qty]) => ({ date, qty })),
    }
  })

  // Persist anomaly alerts for principal
  const anomalies = burnRates.filter(r => r.anomaly_flag)
  if (anomalies.length > 0) {
    for (const a of anomalies) {
      await db.from('alerts').insert({
        school_id: auth.schoolId,
        type:      'inventory_leakage',
        severity:  'high',
        title:     `Potential inventory leakage: ${a.name}`,
        detail: {
          item_id:   a.item_id,
          avg_daily: a.avg_daily_7d,
          expected:  a.expected_daily,
        },
      }).then(() => {}, () => {})
    }
  }

  return NextResponse.json({
    burn_rates:    burnRates,
    student_count: nStudents,
    alerts:        burnRates.filter(r => r.alert).length,
    anomalies:     anomalies.length,
  })
}

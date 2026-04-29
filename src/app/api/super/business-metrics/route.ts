// GET /api/super/business-metrics
// God Mode: revenue, product adoption, school health, geography, packaging insights.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

const TIER_RANGES = [
  { label: 'Starter',    min: 0,    max: 399  },
  { label: 'Growth',     min: 400,  max: 899  },
  { label: 'Pro',        min: 900,  max: 1499 },
  { label: 'Enterprise', min: 1500, max: Infinity },
]

const FEATURE_PRICES: Record<string, number> = {
  gate_pass:        500,
  visitor_log:      500,
  staff_attendance: 800,
  pocket_money:     1000,
  bread_voucher:    500,
  nts_payroll:      1000,
  parent_pwa:       0,
}

function tierFor(count: number) {
  return TIER_RANGES.find(t => count >= t.min && count <= t.max)?.label ?? 'Starter'
}

function basePriceFor(count: number): number {
  if (count < 400)  return 3500
  if (count < 900)  return 6500
  if (count < 1500) return 10000
  return 15000
}

export async function GET(_req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db = adminClient()

  // Fetch all tenant_configs with student counts
  const { data: tenants } = await db
    .from('tenant_configs')
    .select('school_id, name, county, student_count, features, subscription_status, subscription_expires_at, current_term, current_year, school_short_code')

  const { data: schools } = await db
    .from('schools')
    .select('id, name, is_active, created_at')

  // Recent login activity proxy: staff_records last_seen or system_logs
  const { data: recentLogins } = await db
    .from('staff_records')
    .select('school_id, last_seen_at')
    .not('last_seen_at', 'is', null)
    .gte('last_seen_at', new Date(Date.now() - 7 * 86400_000).toISOString())

  const activeSchoolIds = new Set((recentLogins ?? []).map(r => r.school_id))

  const rows = tenants ?? []

  // ── SECTION A: Revenue ─────────────────────────────────────────────────────
  const activeRows = rows.filter(t => t.subscription_status === 'active')

  let totalMRR = 0
  const tierBreakdown: Record<string, { schools: number; mrr: number }> = {}
  const featureRevenue: Record<string, number> = {}

  for (const t of activeRows) {
    const count    = t.student_count ?? 0
    const base     = basePriceFor(count)
    const features = (t.features ?? {}) as Record<string, boolean>
    let addons     = 0

    for (const [feat, price] of Object.entries(FEATURE_PRICES)) {
      if (feat !== 'parent_pwa' && features[feat]) {
        addons += price
        featureRevenue[feat] = (featureRevenue[feat] ?? 0) + price
      }
    }

    const monthly     = base + addons
    totalMRR         += monthly
    const tier        = tierFor(count)
    if (!tierBreakdown[tier]) tierBreakdown[tier] = { schools: 0, mrr: 0 }
    tierBreakdown[tier].schools++
    tierBreakdown[tier].mrr += monthly
  }

  // Churn risk
  const expiringIn30 = rows.filter(t => {
    if (!t.subscription_expires_at) return false
    const days = (new Date(t.subscription_expires_at).getTime() - Date.now()) / 86400_000
    return days >= 0 && days <= 30
  })

  const inactive14 = rows.filter(t => !activeSchoolIds.has(t.school_id))

  // Monthly school additions (last 6 months)
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400_000)
  const newSchoolsByMonth: Record<string, number> = {}
  for (const s of (schools ?? [])) {
    if (!s.created_at) continue
    const d = new Date(s.created_at)
    if (d < sixMonthsAgo) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    newSchoolsByMonth[key] = (newSchoolsByMonth[key] ?? 0) + 1
  }

  // ── SECTION B: Feature Adoption ────────────────────────────────────────────
  const allFeatures = Object.keys(FEATURE_PRICES)
  const adoptionTable = allFeatures.map(feat => {
    const enabled = rows.filter(t => ((t.features ?? {}) as Record<string, boolean>)[feat]).length
    const active  = rows.filter(t => {
      const f = ((t.features ?? {}) as Record<string, boolean>)[feat]
      return f && activeSchoolIds.has(t.school_id)
    }).length
    return {
      feature:   feat,
      enabled,
      active,
      adoption:  enabled > 0 ? Math.round((active / enabled) * 100) : 0,
      revenue:   (featureRevenue[feat] ?? 0),
    }
  })

  // ── SECTION C: School Health Scores ────────────────────────────────────────
  const healthScores = rows.map(t => {
    let score = 0
    if (activeSchoolIds.has(t.school_id)) score += 40  // has logins in 7d
    const features = (t.features ?? {}) as Record<string, boolean>
    if (features.parent_pwa)       score += 15
    if (features.staff_attendance) score += 15
    score += Math.min(30, Object.values(features).filter(Boolean).length * 5)

    const tier = tierFor(t.student_count ?? 0)
    return {
      schoolId:   t.school_id,
      name:       t.name,
      score:      Math.min(100, score),
      tier,
      county:     t.county,
      status:     t.subscription_status,
      atRisk:     score < 50,
    }
  }).sort((a, b) => a.score - b.score)

  // ── SECTION D: Geography ───────────────────────────────────────────────────
  const byCounty: Record<string, number> = {}
  for (const t of rows) {
    const c = t.county ?? 'Unknown'
    byCounty[c] = (byCounty[c] ?? 0) + 1
  }

  // ── SECTION E: Packaging Insights ─────────────────────────────────────────
  const featureEnableCounts = allFeatures.map(f => ({
    feature: f,
    count:   rows.filter(t => ((t.features ?? {}) as Record<string, boolean>)[f]).length,
  })).sort((a, b) => b.count - a.count)

  const avgFeaturesEnabled = rows.length > 0
    ? +(rows.reduce((sum, t) => {
        const f = t.features as Record<string, boolean> | null ?? {}
        return sum + Object.values(f).filter(Boolean).length
      }, 0) / rows.length).toFixed(1)
    : 0

  return NextResponse.json({
    revenue: {
      mrr:                totalMRR,
      arr:                totalMRR * 12,
      activeSchools:      activeRows.length,
      totalSchools:       rows.length,
      tierBreakdown,
      featureRevenue,
      newSchoolsByMonth,
      churnRisk: {
        expiringIn30: expiringIn30.map(t => ({ id: t.school_id, name: t.name, expires: t.subscription_expires_at })),
        inactive14:   inactive14.map(t => ({ id: t.school_id, name: t.name })),
      },
    },
    adoption:  adoptionTable,
    health:    healthScores,
    geography: {
      byCounty,
      topCounty: Object.entries(byCounty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    },
    packaging: {
      topFeatures:         featureEnableCounts.slice(0, 3),
      avgFeaturesEnabled,
      mostAdoptedFirst:    featureEnableCounts[0]?.feature ?? null,
    },
    generatedAt: new Date().toISOString(),
  })
}

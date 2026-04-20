// GET /api/principal/suspension-analytics — aggregated suspension insights
// Returns: department heatmap, recidivism tracker, class/stream breakdown, AI rule-based insights

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db = svc()

  // Date range: default current term (last 120 days) or query param
  const since = req.nextUrl.searchParams.get('since')
    ?? new Date(Date.now() - 120 * 86400000).toISOString().split('T')[0]

  const [casesRes, recordsRes, studentsRes] = await Promise.all([
    // All suspension cases in range
    db.from('suspension_cases')
      .select('id, status, incident_date, allegations, student_id, created_at, students(full_name, class_name, admission_number)')
      .eq('school_id', auth.schoolId!)
      .gte('incident_date', since)
      .order('incident_date', { ascending: false }),

    // All suspension records (approved only)
    db.from('suspension_records')
      .select('id, student_id, start_date, end_date, approved_at')
      .eq('school_id', auth.schoolId!)
      .gte('approved_at', since),

    // Students with 2+ suspensions (recidivism)
    db.from('suspension_records')
      .select('student_id')
      .eq('school_id', auth.schoolId!),
  ])

  const cases   = (casesRes.data   ?? []) as unknown as {
    id: string; status: string; incident_date: string; allegations: string; student_id: string; created_at: string;
    students: { full_name: string; class_name: string; admission_number: string | null } | null;
  }[]
  const records = (recordsRes.data ?? []) as { id: string; student_id: string; start_date: string; end_date: string; approved_at: string }[]
  const allRecords = (studentsRes.data ?? []) as { student_id: string }[]

  // ── Class/stream breakdown ─────────────────────────────────────────────────
  const classBreakdown: Record<string, number> = {}
  for (const c of cases) {
    const cls = c.students?.class_name ?? 'Unknown'
    classBreakdown[cls] = (classBreakdown[cls] ?? 0) + 1
  }
  const classRanking = Object.entries(classBreakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([class_name, count]) => ({ class_name, count }))

  // ── Allegations heatmap (keyword frequency) ───────────────────────────────
  const keywords = [
    'fighting', 'bullying', 'violence', 'theft', 'drugs', 'alcohol',
    'insubordination', 'absenteeism', 'vandalism', 'assault', 'cheating', 'phone',
  ]
  const allegationHeatmap: Record<string, number> = {}
  for (const c of cases) {
    const lower = c.allegations.toLowerCase()
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        allegationHeatmap[kw] = (allegationHeatmap[kw] ?? 0) + 1
      }
    }
  }
  const topAllegations = Object.entries(allegationHeatmap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([type, count]) => ({ type, count }))

  // ── Recidivism tracker ────────────────────────────────────────────────────
  const suspCountByStudent: Record<string, number> = {}
  for (const r of allRecords) {
    suspCountByStudent[r.student_id] = (suspCountByStudent[r.student_id] ?? 0) + 1
  }
  const recidivists = Object.entries(suspCountByStudent)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)

  // Enrich recidivists with student data
  const recidivistStudentIds = recidivists.map(([id]) => id)
  let recidivistData: { student_id: string; suspension_count: number; full_name: string; class_name: string }[] = []
  if (recidivistStudentIds.length > 0) {
    const { data: stdData } = await db
      .from('students')
      .select('id, full_name, class_name')
      .in('id', recidivistStudentIds.slice(0, 20))
      .eq('school_id', auth.schoolId!)

    recidivistData = recidivists.slice(0, 20).map(([student_id, count]) => {
      const s = (stdData ?? []).find((x: { id: string }) => x.id === student_id) as { full_name: string; class_name: string } | undefined
      return { student_id, suspension_count: count, full_name: s?.full_name ?? 'Unknown', class_name: s?.class_name ?? '' }
    })
  }

  // ── Monthly trend ─────────────────────────────────────────────────────────
  const monthlyTrend: Record<string, number> = {}
  for (const c of cases) {
    const month = c.incident_date.slice(0, 7) // YYYY-MM
    monthlyTrend[month] = (monthlyTrend[month] ?? 0) + 1
  }
  const trendData = Object.entries(monthlyTrend)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))

  // ── Average suspension duration ──────────────────────────────────────────
  let totalDays = 0; let durationCount = 0
  for (const r of records) {
    const start = new Date(r.start_date).getTime()
    const end   = new Date(r.end_date).getTime()
    const days  = Math.round((end - start) / 86400000) + 1
    if (days > 0 && days < 30) { totalDays += days; durationCount++ }
  }
  const avgDuration = durationCount > 0 ? Math.round(totalDays / durationCount) : null

  // ── Rule-based AI insights ────────────────────────────────────────────────
  const insights: { severity: 'high' | 'medium' | 'low'; message: string }[] = []

  const totalCases    = cases.length
  const approvedCount = cases.filter(c => c.status === 'approved').length
  const pendingCount  = cases.filter(c => ['draft', 'submitted'].includes(c.status)).length

  if (recidivistData.filter(r => r.suspension_count >= 3).length > 0) {
    const names = recidivistData.filter(r => r.suspension_count >= 3).map(r => r.full_name).slice(0, 3).join(', ')
    insights.push({ severity: 'high', message: `${recidivistData.filter(r => r.suspension_count >= 3).length} student(s) with 3+ suspensions require mandatory G&C referral: ${names}` })
  }

  if (topAllegations[0]?.count > totalCases * 0.4 && topAllegations[0]?.count >= 3) {
    insights.push({ severity: 'high', message: `"${topAllegations[0].type}" accounts for ${Math.round(topAllegations[0].count / totalCases * 100)}% of all cases — consider a targeted school-wide intervention` })
  }

  if (classRanking[0]?.count >= 4) {
    insights.push({ severity: 'medium', message: `${classRanking[0].class_name} has the highest suspension rate (${classRanking[0].count} cases) — consider a class-level pastoral review` })
  }

  if (pendingCount >= 3) {
    insights.push({ severity: 'medium', message: `${pendingCount} cases pending review — approve or decline to clear the queue` })
  }

  if (trendData.length >= 2) {
    const last  = trendData[trendData.length - 1].count
    const prev  = trendData[trendData.length - 2].count
    if (last > prev * 1.5 && last >= 3) {
      insights.push({ severity: 'high', message: `Suspension rate increased ${Math.round((last - prev) / prev * 100)}% vs last month — investigate systemic causes` })
    } else if (last < prev * 0.6 && prev >= 3) {
      insights.push({ severity: 'low', message: `Suspension rate dropped ${Math.round((prev - last) / prev * 100)}% vs last month — positive trend` })
    }
  }

  if (avgDuration !== null && avgDuration > 7) {
    insights.push({ severity: 'medium', message: `Average suspension duration is ${avgDuration} days — review whether shorter interventions are appropriate` })
  }

  return NextResponse.json({
    summary: {
      total_cases:      totalCases,
      approved:         approvedCount,
      pending:          pendingCount,
      avg_duration_days: avgDuration,
      recidivist_count: recidivistData.length,
      since,
    },
    class_ranking:      classRanking,
    allegation_heatmap: topAllegations,
    recidivists:        recidivistData,
    monthly_trend:      trendData,
    insights,
  })
}

// GET /api/analytics/principal/cashflow-forecast
// Predictive cash flow using historical fee payment patterns

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { getCachedOrCompute } from '@/lib/analytics/cacheUtils'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/** Return the week-of-term (1-13) for a payment_date relative to a term_start_date */
function weekOfTerm(paymentDate: string, termStart: string): number {
  const diff = new Date(paymentDate).getTime() - new Date(termStart).getTime()
  const days = Math.floor(diff / 86_400_000)
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

/** Approx term start dates by year + term number */
function termStartDate(year: number, termNum: number): string {
  const starts: Record<number, string> = { 1: `${year}-01-06`, 2: `${year}-05-05`, 3: `${year}-09-08` }
  return starts[termNum] ?? `${year}-01-06`
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const termParam = req.nextUrl.searchParams.get('term')
  if (!termParam) return NextResponse.json({ error: 'term is required' }, { status: 400 })

  const cacheKey = `cashflow:${termParam}`

  const result = await getCachedOrCompute(
    auth.schoolId,
    cacheKey,
    async () => {
      const db = admin()

      // ── Fee structure total expected ──────────────────────
      const { data: feeStructure } = await db
        .from('fee_structure_items')
        .select('amount')
        .eq('school_id', auth.schoolId)
        .eq('mandatory', true)

      const feePerStudent = (feeStructure ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0)

      const { count: studentCount } = await db
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', auth.schoolId)
        .eq('is_active', true)

      const total_expected = feePerStudent * (studentCount ?? 0)

      // ── Parse current term ────────────────────────────────
      const termNum  = parseInt(termParam.replace(/\D/g, '')) || 1
      const currYear = new Date().getFullYear()
      const startDate = termStartDate(currYear, termNum)

      // ── All fee records (current + last 3 terms for history) ─
      const { data: allFees } = await db
        .from('fee_records')
        .select('student_id, amount_paid, payment_date, term')
        .eq('school_id', auth.schoolId)
        .not('amount_paid', 'is', null)
        .not('payment_date', 'is', null)
        .order('payment_date', { ascending: true })

      // ── Current term fees ─────────────────────────────────
      const currentFees = (allFees ?? []).filter(f => f.term === termParam)
      const collected_to_date = currentFees.reduce((s, f) => s + Number(f.amount_paid), 0)
      const collection_rate = total_expected > 0
        ? parseFloat(((collected_to_date / total_expected) * 100).toFixed(2))
        : 0

      // ── Weekly breakdown of current term ─────────────────
      const currentByWeek = new Array(13).fill(0)
      for (const f of currentFees) {
        const w = weekOfTerm(f.payment_date, startDate)
        currentByWeek[w - 1] += Number(f.amount_paid)
      }

      // ── Historical pattern: last 3 terms (not current) ───
      const prevTermFees = (allFees ?? []).filter(f => f.term !== termParam)

      // Group historical by (term, week) → total collected
      const histByTerm = new Map<string, number[]>()
      for (const f of prevTermFees) {
        const tKey = f.term ?? ''
        if (!histByTerm.has(tKey)) histByTerm.set(tKey, new Array(13).fill(0))
        // Approximate week using current-term start as proxy
        const w = weekOfTerm(f.payment_date, startDate)
        histByTerm.get(tKey)![w - 1] += Number(f.amount_paid)
      }

      // Average weekly collection fraction across historical terms
      const histTerms = [...histByTerm.values()].slice(-3)
      const avgByWeek = new Array(13).fill(0)
      if (histTerms.length > 0) {
        for (let w = 0; w < 13; w++) {
          const sum = histTerms.reduce((s, t) => s + t[w], 0)
          const termTotal = histTerms.reduce((s, t) => s + t.reduce((a, b) => a + b, 0), 0) / histTerms.length
          avgByWeek[w] = termTotal > 0
            ? parseFloat(((sum / histTerms.length / termTotal) * 100).toFixed(2))
            : parseFloat(((1 / 13) * 100).toFixed(2))
        }
      } else {
        // No history: uniform distribution
        for (let w = 0; w < 13; w++) avgByWeek[w] = parseFloat((100 / 13).toFixed(2))
      }

      // ── Determine current week ────────────────────────────
      const currentWeek = Math.min(13, Math.max(1,
        Math.ceil((Date.now() - new Date(startDate).getTime()) / (7 * 86_400_000))
      ))

      // ── Project future weeks ──────────────────────────────
      const remaining_pct = avgByWeek.slice(currentWeek).reduce((a, b) => a + b, 0)
      const projected_final = collected_to_date + (total_expected * remaining_pct / 100)
      const collection_gap  = parseFloat((total_expected - projected_final).toFixed(2))

      // ── Peak weeks (top 3) ────────────────────────────────
      const sorted_weeks = [...avgByWeek]
        .map((v, i) => ({ week: i + 1, pct: v }))
        .sort((a, b) => b.pct - a.pct)
      const peak_collection_weeks = sorted_weeks.slice(0, 3).map(w => w.week).sort((a, b) => a - b)

      // ── Build weekly heatmap ──────────────────────────────
      const weekLabels = [
        'Week 1','Week 2','Week 3','Week 4','Week 5','Week 6','Week 7',
        'Week 8','Week 9','Week 10','Week 11','Week 12','Week 13',
      ]

      const weekly_heatmap = Array.from({ length: 13 }, (_, i) => {
        const w      = i + 1
        const isPast = w < currentWeek
        const startMs = new Date(startDate).getTime() + (i * 7 * 86_400_000)
        const endMs   = startMs + 6 * 86_400_000
        const fmt     = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

        return {
          week:               w,
          week_label:         `${weekLabels[i]} (${fmt(startMs)}–${fmt(endMs)})`,
          historical_avg_pct: avgByWeek[i],
          current_amount:     isPast ? parseFloat(currentByWeek[i].toFixed(2)) : null,
          projected_amount:   !isPast
            ? parseFloat((total_expected * avgByWeek[i] / 100).toFixed(2))
            : null,
          is_peak_week:       peak_collection_weeks.includes(w),
        }
      })

      // ── Recommended payment schedule ──────────────────────
      const recommended_payment_schedule = [
        {
          item:             'Beans & Maize order',
          recommended_week: peak_collection_weeks[0] + 1,
          reason:           `Schedule after Week ${peak_collection_weeks[0]} — peak collections complete by then`,
        },
        {
          item:             'Lab chemicals requisition',
          recommended_week: peak_collection_weeks[1] ?? 4,
          reason:           `${(avgByWeek.slice(0, (peak_collection_weeks[1] ?? 4)).reduce((a, b) => a + b, 0)).toFixed(0)}% of fees expected by end of Week ${(peak_collection_weeks[1] ?? 4) - 1}`,
        },
        {
          item:             'Staff development fund transfer',
          recommended_week: 8,
          reason:           'Mid-term: sufficient liquidity expected after first two peak periods',
        },
      ]

      // ── Installment payers ────────────────────────────────
      const paymentsByStudent = new Map<string, Array<{ date: string; amount: number }>>()
      for (const f of currentFees) {
        if (!paymentsByStudent.has(f.student_id)) paymentsByStudent.set(f.student_id, [])
        paymentsByStudent.get(f.student_id)!.push({ date: f.payment_date, amount: Number(f.amount_paid) })
      }

      const { data: students } = await db
        .from('students')
        .select('id, name, admission_number, class_name')
        .eq('school_id', auth.schoolId)
        .eq('is_active', true)

      const studentInfo = new Map(students?.map(s => [s.id, s]) ?? [])

      const installment_payers = []
      for (const [sid, payments] of paymentsByStudent) {
        if (payments.length < 3) continue
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
        const isInstallment = payments.every(p => p.amount < feePerStudent * 0.3)
        if (!isInstallment) continue

        const sorted = [...payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        const avgAmt  = totalPaid / payments.length
        let avgDays   = 7
        if (sorted.length >= 2) {
          const diffs = []
          for (let i = 1; i < sorted.length; i++) {
            diffs.push((new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86_400_000)
          }
          avgDays = diffs.reduce((a, b) => a + b, 0) / diffs.length
        }

        const lastDate    = sorted[sorted.length - 1].date
        const nextExpDate = new Date(new Date(lastDate).getTime() + avgDays * 86_400_000)
          .toISOString().split('T')[0]

        const s = studentInfo.get(sid)
        installment_payers.push({
          student_id:             sid,
          virtual_qr_id:          s?.admission_number ?? sid,
          class:                  s?.class_name ?? '',
          stream:                 '',
          fee_balance:            parseFloat(Math.max(0, feePerStudent - totalPaid).toFixed(2)),
          payment_count:          payments.length,
          average_payment:        parseFloat(avgAmt.toFixed(2)),
          days_between_payments:  parseFloat(avgDays.toFixed(1)),
          next_expected_payment:  nextExpDate,
          total_paid_this_term:   parseFloat(totalPaid.toFixed(2)),
          payment_plan_suggested: true,
        })
      }

      // ── Insight ───────────────────────────────────────────
      const below = collection_rate < (avgByWeek.slice(0, currentWeek).reduce((a, b) => a + b, 0))
      const insight = [
        histTerms.length > 0
          ? `Based on ${histTerms.length} term(s) of data: ${peak_collection_weeks.join(', ')} are peak collection weeks.`
          : 'No historical data yet — using uniform distribution.',
        below
          ? `Current Week ${currentWeek} collection is below historical average. Consider sending fee reminders.`
          : `Collections are tracking on target for Term ${termNum}.`,
        installment_payers.length
          ? `${installment_payers.length} consistent installment payer(s) identified — do not send home.`
          : '',
      ].filter(Boolean).join(' ')

      return {
        current_term:               termParam,
        total_expected:             parseFloat(total_expected.toFixed(2)),
        collected_to_date:          parseFloat(collected_to_date.toFixed(2)),
        collection_rate,
        projected_final_collection: parseFloat(projected_final.toFixed(2)),
        collection_gap,
        weekly_heatmap,
        peak_collection_weeks,
        recommended_payment_schedule,
        installment_payers,
        insight,
      }
    },
    10, // 10-min cache
  )

  return NextResponse.json(result)
}

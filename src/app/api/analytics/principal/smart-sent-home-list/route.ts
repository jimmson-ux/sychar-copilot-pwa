// GET /api/analytics/principal/smart-sent-home-list
// Segments fee debtors: send home / handle with care / installment payers

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const sp          = req.nextUrl.searchParams
  const min_balance = parseFloat(sp.get('min_balance') ?? '5000')
  const term        = sp.get('term')

  if (!term) return NextResponse.json({ error: 'term is required' }, { status: 400 })

  const db = admin()

  // ── All active students ───────────────────────────────────
  const { data: students } = await db
    .from('students')
    .select('id, name, admission_number, class_name, is_active')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)

  if (!students?.length) {
    return NextResponse.json({ total_debtors: 0, total_debt: 0, segments: { send_home_immediately: [], handle_with_care: [], installment_payers: [] }, strategic_insight: 'No students found.' })
  }

  const studentIds = students.map(s => s.id)

  // ── Fee records ───────────────────────────────────────────
  const { data: feeRecords } = await db
    .from('fee_records')
    .select('student_id, amount_paid, payment_date, term')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)

  // Total paid per student (all terms)
  const paidByStudent = new Map<string, { total: number; thisTermPayments: Array<{ date: string; amount: number }> }>()
  for (const f of feeRecords ?? []) {
    if (!paidByStudent.has(f.student_id)) {
      paidByStudent.set(f.student_id, { total: 0, thisTermPayments: [] })
    }
    const b = paidByStudent.get(f.student_id)!
    b.total += Number(f.amount_paid ?? 0)
    if (f.term === term) {
      b.thisTermPayments.push({ date: f.payment_date, amount: Number(f.amount_paid ?? 0) })
    }
  }

  // Fee structure total
  const { data: feeStructure } = await db
    .from('fee_structure_items')
    .select('amount')
    .eq('school_id', auth.schoolId)
    .eq('mandatory', true)

  const totalExpected = (feeStructure ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0)

  // ── Marks this term (for performance flags) ───────────────
  const { data: marks } = await db
    .from('marks')
    .select('student_id, percentage, score')
    .eq('school_id', auth.schoolId)
    .eq('term', term)
    .in('student_id', studentIds)

  const meanByStudent = new Map<string, { total: number; count: number }>()
  for (const m of marks ?? []) {
    if (!meanByStudent.has(m.student_id)) meanByStudent.set(m.student_id, { total: 0, count: 0 })
    const b = meanByStudent.get(m.student_id)!
    b.total += Number(m.percentage ?? m.score ?? 0)
    b.count++
  }

  // ── Top-10 flags (school-wide for this term) ──────────────
  const studentMeans: Array<{ id: string; mean: number }> = []
  for (const [sid, data] of meanByStudent) {
    studentMeans.push({ id: sid, mean: data.total / data.count })
  }
  studentMeans.sort((a, b) => b.mean - a.mean)
  const top10Ids = new Set(studentMeans.slice(0, 10).map(s => s.id))

  // ── G&C flags ─────────────────────────────────────────────
  const { data: welfare } = await db
    .from('welfare_logs')
    .select('student_id')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)
  const gcSet = new Set(welfare?.map(w => w.student_id) ?? [])

  // ── Form 4 / final-year candidate check ───────────────────
  const form4Set = new Set(
    students.filter(s => /form\s*4|grade\s*12/i.test(s.class_name ?? '')).map(s => s.id)
  )

  // ── Build debtor list ─────────────────────────────────────
  const send_home_immediately = []
  const handle_with_care      = []
  const installment_payers    = []

  let total_debt = 0

  for (const s of students) {
    const paid     = paidByStudent.get(s.id)?.total ?? 0
    const balance  = Math.max(0, totalExpected - paid)
    if (balance < min_balance) continue

    total_debt += balance

    const meanEntry  = meanByStudent.get(s.id)
    const mean_score = meanEntry ? parseFloat((meanEntry.total / meanEntry.count).toFixed(2)) : 0
    const mean_grade = mean_score >= 50 ? 'C+' : mean_score >= 40 ? 'C' : 'D'

    const thisTermPayments = paidByStudent.get(s.id)?.thisTermPayments ?? []
    const is_installment   = thisTermPayments.length >= 3 &&
      thisTermPayments.every(p => p.amount < totalExpected * 0.3)

    const base = {
      student_id:    s.id,
      virtual_qr_id: s.admission_number ?? s.id,
      class:         s.class_name ?? '',
      stream:        '',
      fee_balance:   parseFloat(balance.toFixed(2)),
      mean_score,
      mean_grade,
    }

    if (is_installment) {
      const sorted     = [...thisTermPayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      const avgPayment = thisTermPayments.reduce((s, p) => s + p.amount, 0) / thisTermPayments.length
      let avgDays      = 7
      if (sorted.length >= 2) {
        const diffs = []
        for (let i = 1; i < sorted.length; i++) {
          diffs.push((new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86_400_000)
        }
        avgDays = diffs.reduce((a, b) => a + b, 0) / diffs.length
      }
      const lastDate    = sorted[sorted.length - 1]?.date ?? new Date().toISOString()
      const nextExpDate = new Date(new Date(lastDate).getTime() + avgDays * 86_400_000).toISOString().split('T')[0]

      installment_payers.push({
        ...base,
        payment_count_this_term:  thisTermPayments.length,
        average_payment_amount:   parseFloat(avgPayment.toFixed(2)),
        last_payment_date:        lastDate,
        next_expected_payment:    nextExpDate,
        total_paid_this_term:     parseFloat(thisTermPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)),
      })
      continue
    }

    const careReasons: string[] = []
    if (form4Set.has(s.id)) {
      const weeksToExam = 8
      careReasons.push(`Form 4 candidate — exam in ~${weeksToExam} weeks`)
    }
    if (top10Ids.has(s.id)) careReasons.push(`Top 10 performer this term`)
    if (gcSet.has(s.id))    careReasons.push(`Active G&C case — sensitive situation`)

    if (careReasons.length) {
      handle_with_care.push({ ...base, reason_for_flag: careReasons.join('; ') })
    } else {
      send_home_immediately.push(base)
    }
  }

  const total_debtors = send_home_immediately.length + handle_with_care.length + installment_payers.length

  // ── Strategic insight ─────────────────────────────────────
  const insight = [
    `Of ${total_debtors} debtor(s) with balance ≥ KES ${min_balance.toLocaleString()}:`,
    form4Set.size    ? `${handle_with_care.filter(s => /Form 4/.test(s.reason_for_flag)).length} are Form 4 candidates.` : '',
    top10Ids.size    ? `${handle_with_care.filter(s => /Top 10/.test(s.reason_for_flag)).length} are top-10 performers.` : '',
    installment_payers.length ? `${installment_payers.length} are consistent installment payers.` : '',
    handle_with_care.length
      ? `Recommend exempting ${handle_with_care.length + installment_payers.length} from today's send-home list.`
      : 'All debtors are candidates for send-home.',
  ].filter(Boolean).join(' ')

  return NextResponse.json({
    total_debtors,
    total_debt:  parseFloat(total_debt.toFixed(2)),
    segments: {
      send_home_immediately: send_home_immediately.sort((a, b) => b.fee_balance - a.fee_balance),
      handle_with_care:      handle_with_care.sort((a, b) => b.fee_balance - a.fee_balance),
      installment_payers:    installment_payers.sort((a, b) => b.fee_balance - a.fee_balance),
    },
    strategic_insight: insight,
  })
}

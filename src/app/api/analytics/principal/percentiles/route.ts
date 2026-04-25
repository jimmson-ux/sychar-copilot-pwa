// GET /api/analytics/principal/percentiles
// Top 10 and bottom 10 students for a given level + term

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import {
  calculateGrade844,
  calculateGradeCBC,
} from '@/lib/analytics/gradeUtils'

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

  const sp    = req.nextUrl.searchParams
  const term  = sp.get('term')
  const level = sp.get('level') // e.g. 'Form 4' or 'Grade 10'

  if (!term || !level) {
    return NextResponse.json({ error: 'term and level are required' }, { status: 400 })
  }

  const db = admin()

  // ── Students in this level ────────────────────────────────
  const { data: students } = await db
    .from('students')
    .select('id, name, admission_number, class_name')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)
    .ilike('class_name', `${level}%`)

  if (!students?.length) {
    return NextResponse.json({ level, total_students: 0, top_10: [], bottom_10: [] })
  }

  const studentIds = students.map(s => s.id)
  const isCBC = level.toLowerCase().startsWith('grade')

  // ── Marks this term ───────────────────────────────────────
  const { data: marks, error } = await db
    .from('marks')
    .select('student_id, percentage, score, class_id')
    .eq('school_id', auth.schoolId)
    .eq('term', term)
    .in('student_id', studentIds)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // ── Mean per student ──────────────────────────────────────
  const meanMap = new Map<string, { total: number; count: number }>()
  for (const m of marks ?? []) {
    if (!meanMap.has(m.student_id)) meanMap.set(m.student_id, { total: 0, count: 0 })
    const b = meanMap.get(m.student_id)!
    b.total += Number(m.percentage ?? m.score ?? 0)
    b.count++
  }

  // ── Fee balances ──────────────────────────────────────────
  const { data: feeRows } = await db
    .from('fee_records')
    .select('student_id, amount_paid')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)

  const totalPaidByStudent = new Map<string, number>()
  for (const f of feeRows ?? []) {
    totalPaidByStudent.set(
      f.student_id,
      (totalPaidByStudent.get(f.student_id) ?? 0) + Number(f.amount_paid ?? 0),
    )
  }

  // Expected fee per student (rough: sum of mandatory items)
  const { data: feeStructure } = await db
    .from('fee_structure_items')
    .select('amount')
    .eq('school_id', auth.schoolId)
    .eq('mandatory', true)
    .ilike('term', `%${term.replace(/\D/g, '') || '1'}%`)

  const totalExpected = (feeStructure ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0)

  // ── G&C / welfare flags ───────────────────────────────────
  const { data: welfare } = await db
    .from('welfare_logs')
    .select('student_id')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)

  const gcSet = new Set(welfare?.map(w => w.student_id) ?? [])

  // ── Intervention counts (discipline records) ──────────────
  const { data: discipline } = await db
    .from('discipline_records')
    .select('student_id')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)

  const interventionCount = new Map<string, number>()
  for (const d of discipline ?? []) {
    interventionCount.set(d.student_id, (interventionCount.get(d.student_id) ?? 0) + 1)
  }

  // ── Student info map ──────────────────────────────────────
  const studentInfo = new Map(students.map(s => [s.id, s]))

  // ── Build ranked list ─────────────────────────────────────
  const ranked = students
    .map(s => {
      const m         = meanMap.get(s.id)
      const mean_score = m ? parseFloat((m.total / m.count).toFixed(2)) : 0
      const grade_info = isCBC
        ? { grade: calculateGradeCBC(mean_score).grade_code }
        : { grade: calculateGrade844(mean_score).grade }
      const paid       = totalPaidByStudent.get(s.id) ?? 0
      const fee_balance = Math.max(0, totalExpected - paid)

      return {
        student_id:    s.id,
        virtual_qr_id: s.admission_number ?? s.id,
        class:         s.class_name ?? '',
        stream:        '',
        mean_score,
        mean_grade:    grade_info.grade,
        fee_balance:   parseFloat(fee_balance.toFixed(2)),
        gc_support:    gcSet.has(s.id),
        intervention_count: interventionCount.get(s.id) ?? 0,
        rank:          0,
      }
    })
    .filter(s => s.mean_score > 0)
    .sort((a, b) => b.mean_score - a.mean_score)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  const top_10    = ranked.slice(0, 10)
  const bottom_10 = ranked.slice(-10).reverse().map((s, i) => ({ ...s, rank: ranked.length - i }))

  return NextResponse.json({
    level,
    total_students: ranked.length,
    top_10,
    bottom_10,
  })
}

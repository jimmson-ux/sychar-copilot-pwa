// GET /api/analytics/deputy/value-add-tracking
// Compares current mean to KCPE/KPSEA admission baseline

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { normaliseBaseline } from '@/lib/analytics/gradeUtils'
import { getCachedOrCompute } from '@/lib/analytics/cacheUtils'

const ALLOWED = new Set(['deputy_principal_academic','deputy_principal_academics','principal','dean_of_studies'])

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

type VACategory = 'high_value_add' | 'moderate' | 'neutral' | 'regression'

function vaCategory(va: number): VACategory {
  if (va > 15)  return 'high_value_add'
  if (va > 5)   return 'moderate'
  if (va >= -5) return 'neutral'
  return 'regression'
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classLevel = req.nextUrl.searchParams.get('class_level')
  const cacheKey   = `value_add${classLevel ? `:${classLevel}` : ':all'}`

  const result = await getCachedOrCompute(
    auth.schoolId,
    cacheKey,
    async () => {
      const db = admin()

      // ── Students with baseline ───────────────────────────
      let studQuery = db
        .from('students')
        .select('id, name, admission_number, class_name, admission_baseline, baseline_type, created_at')
        .eq('school_id', auth.schoolId)
        .eq('is_active', true)
        .not('admission_baseline', 'is', null)

      if (classLevel) {
        studQuery = studQuery.ilike('class_name', `${classLevel}%`)
      }

      const { data: baselineStudents, error: bErr } = await studQuery
      if (bErr) throw new Error(bErr.message)

      // ── All students for total count ─────────────────────
      const { count: totalStudents } = await db
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', auth.schoolId)
        .eq('is_active', true)

      if (!baselineStudents?.length) {
        return {
          students_with_baseline:    0,
          students_without_baseline: totalStudents ?? 0,
          school_value_add_index:    0,
          distribution:              { high_value_add: 0, moderate: 0, neutral: 0, regression: 0 },
          students:                  [],
          class_value_add:           [],
        }
      }

      const studentIds = baselineStudents.map(s => s.id)

      // ── Current-year marks ────────────────────────────────
      const currentYear = new Date().getFullYear().toString()

      const { data: marks } = await db
        .from('marks')
        .select('student_id, percentage, score')
        .eq('school_id', auth.schoolId)
        .eq('academic_year', currentYear)
        .in('student_id', studentIds)

      // Mean score per student this academic year
      const meanByStudent = new Map<string, { total: number; count: number }>()
      for (const m of marks ?? []) {
        if (!meanByStudent.has(m.student_id)) meanByStudent.set(m.student_id, { total: 0, count: 0 })
        const b = meanByStudent.get(m.student_id)!
        b.total += Number(m.percentage ?? m.score ?? 0)
        b.count++
      }

      // ── Class teacher lookup ──────────────────────────────
      const { data: classteachers } = await db
        .from('staff_records')
        .select('assigned_class_name, full_name')
        .eq('school_id', auth.schoolId)
        .eq('sub_role', 'class_teacher')
        .not('assigned_class_name', 'is', null)

      const ctByClass = new Map(classteachers?.map(ct => [ct.assigned_class_name, ct.full_name]) ?? [])

      // ── Build student value-add rows ──────────────────────
      const students = []
      const dist     = { high_value_add: 0, moderate: 0, neutral: 0, regression: 0 }
      const vaValues: number[] = []

      for (const s of baselineStudents) {
        const type     = (s.baseline_type ?? 'KCPE') as 'KCPE' | 'KPSEA'
        const baseline = Number(s.admission_baseline)
        const baselinePct = normaliseBaseline(baseline, type)

        const meanEntry   = meanByStudent.get(s.id)
        const currentMean = meanEntry
          ? parseFloat((meanEntry.total / meanEntry.count).toFixed(2))
          : baselinePct // no marks yet — neutral

        const value_add = parseFloat((currentMean - baselinePct).toFixed(2))
        const category  = vaCategory(value_add)
        dist[category]++
        vaValues.push(value_add)

        const yearsEnrolled = Math.max(1, new Date().getFullYear() - new Date(s.created_at).getFullYear())

        students.push({
          student_id:              s.id,
          virtual_qr_id:           s.admission_number ?? s.id,
          class:                   s.class_name ?? '',
          stream:                  '',
          baseline_type:           type,
          baseline_score:          baseline,
          baseline_percentage:     parseFloat(baselinePct.toFixed(2)),
          current_mean_percentage: currentMean,
          value_add,
          category,
          years_enrolled:          yearsEnrolled,
        })
      }

      students.sort((a, b) => b.value_add - a.value_add)

      const school_value_add_index = vaValues.length
        ? parseFloat((vaValues.reduce((a, b) => a + b, 0) / vaValues.length).toFixed(2))
        : 0

      // ── Class-level value-add aggregation ─────────────────
      const classVA = new Map<string, { values: number[]; regressions: number }>()
      for (const s of students) {
        const k = s.class
        if (!classVA.has(k)) classVA.set(k, { values: [], regressions: 0 })
        classVA.get(k)!.values.push(s.value_add)
        if (s.category === 'regression') classVA.get(k)!.regressions++
      }

      const class_value_add = Array.from(classVA.entries()).map(([class_name, data]) => ({
        class_name,
        stream_name:       '',
        class_teacher:     ctByClass.get(class_name) ?? '',
        average_value_add: parseFloat((data.values.reduce((a, b) => a + b, 0) / data.values.length).toFixed(2)),
        regression_count:  data.regressions,
      })).sort((a, b) => b.average_value_add - a.average_value_add)

      return {
        students_with_baseline:    baselineStudents.length,
        students_without_baseline: (totalStudents ?? 0) - baselineStudents.length,
        school_value_add_index,
        distribution: dist,
        students,
        class_value_add,
      }
    },
    30,
  )

  return NextResponse.json(result)
}

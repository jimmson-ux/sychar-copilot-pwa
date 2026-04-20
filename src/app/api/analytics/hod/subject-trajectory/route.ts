// GET /api/analytics/hod/subject-trajectory
// Historical performance across all terms for a subject

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { getCachedOrCompute } from '@/lib/analytics/cacheUtils'

const HOD_ROLES = new Set([
  'hod_subjects', 'hod_pathways', 'hod_sciences',
  'hod_mathematics', 'hod_languages', 'hod_humanities',
  'hod_applied_sciences', 'hod_games_sports',
  'dean_of_studies', 'deputy_principal_academic',
  'deputy_principal_academics', 'principal',
])

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

  if (!HOD_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const subjectId = req.nextUrl.searchParams.get('subject_id')
  if (!subjectId) {
    return NextResponse.json({ error: 'subject_id is required' }, { status: 400 })
  }

  const db = admin()

  const { data: subject } = await db
    .from('subjects')
    .select('name, department')
    .eq('id', subjectId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!subject) {
    return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
  }

  // Department ownership check for pure HOD roles
  if (!['principal', 'deputy_principal_academic', 'deputy_principal_academics', 'dean_of_studies'].includes(auth.subRole)) {
    const { data: staffRow } = await db
      .from('staff_records')
      .select('department')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (staffRow?.department && subject.department &&
        staffRow.department.toLowerCase() !== subject.department.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden: not your department' }, { status: 403 })
    }
  }

  const cacheKey = `subject_trajectory:${subjectId}`

  const result = await getCachedOrCompute(
    auth.schoolId,
    cacheKey,
    async () => {
      // ── All marks for this subject grouped by term ──────
      const { data: marks, error } = await db
        .from('marks')
        .select('student_id, percentage, score, term, academic_year, created_at')
        .eq('school_id', auth.schoolId)
        .eq('subject_id', subjectId)
        .order('academic_year', { ascending: true })
        .order('term', { ascending: true })

      if (error) throw new Error(error.message)

      // Group by term label
      const termMap = new Map<string, {
        term_label: string
        academic_year: string
        scores: number[]
      }>()

      for (const m of marks ?? []) {
        const key = `${m.academic_year ?? ''}|${m.term ?? ''}`
        if (!termMap.has(key)) {
          termMap.set(key, {
            term_label:    m.term ?? '',
            academic_year: m.academic_year ?? '',
            scores:        [],
          })
        }
        termMap.get(key)!.scores.push(Number(m.percentage ?? m.score ?? 0))
      }

      const trajectory = Array.from(termMap.entries()).map(([_key, data]) => {
        const { scores, term_label, academic_year } = data
        const avg      = scores.reduce((a, b) => a + b, 0) / scores.length
        const pass_rate = parseFloat(((scores.filter(s => s >= 40).length / scores.length) * 100).toFixed(2))
        return {
          term_id:       _key,
          term_name:     term_label,
          academic_year,
          school_average: parseFloat(avg.toFixed(2)),
          pass_rate,
          student_count: scores.length,
          top_score:     parseFloat(Math.max(...scores).toFixed(2)),
          bottom_score:  parseFloat(Math.min(...scores).toFixed(2)),
        }
      })

      // ── Trend calculation ─────────────────────────────
      let trend: 'improving' | 'plateauing' | 'declining' = 'plateauing'
      let trend_percentage = 0
      const turning_points = []

      if (trajectory.length >= 2) {
        const recent = trajectory.slice(-3)
        const first  = recent[0].school_average
        const last   = recent[recent.length - 1].school_average
        const change = last - first
        trend_percentage = parseFloat(change.toFixed(2))

        if (change > 3)       trend = 'improving'
        else if (change < -3) trend = 'declining'

        // Find turning points (change > 5% between consecutive terms)
        for (let i = 1; i < trajectory.length; i++) {
          const delta = trajectory[i].school_average - trajectory[i - 1].school_average
          if (Math.abs(delta) >= 5) {
            turning_points.push({
              term_name:     trajectory[i].term_name,
              change:        parseFloat(delta.toFixed(2)),
              possible_cause: delta < 0
                ? 'Performance dip — possible teacher change or curriculum shift'
                : 'Performance improvement — possible intervention effect',
            })
          }
        }
      }

      const insight = trajectory.length < 2
        ? 'Not enough historical data for trend analysis.'
        : `${subject.name} is ${trend} at ${Math.abs(trend_percentage).toFixed(1)}% over the last ${trajectory.length} recorded term(s).`

      return {
        subject_name:     subject.name,
        department:       subject.department ?? '',
        trajectory,
        trend,
        trend_percentage,
        turning_points,
        insight,
      }
    },
    60, // 1-hour cache — historical data changes rarely
  )

  return NextResponse.json(result)
}

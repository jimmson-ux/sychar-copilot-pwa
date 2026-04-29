// GET  /api/principal/risk-scores — latest student risk scores (principal/deputy only)
// POST /api/principal/risk-scores — trigger recomputation for school

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const ALLOWED = new Set(['principal', 'deputy_principal', 'dean_of_students', 'deputy_admin'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db   = svc()
  const tier = req.nextUrl.searchParams.get('tier') ?? null   // filter by tier
  const cls  = req.nextUrl.searchParams.get('class') ?? null  // filter by class

  // Latest risk score per student (max one per student/week)
  let query = db
    .from('student_risk_scores')
    .select(`
      id, student_id, risk_probability, risk_tier,
      attendance_score, grade_trend_score, grade_volatility,
      discipline_score, engagement_score,
      flags, recommendations, computed_at,
      students!student_id(full_name, admission_no, class_name, gender)
    `)
    .eq('school_id', auth.schoolId!)
    .order('computed_at', { ascending: false })
    .order('risk_probability', { ascending: false })
    .limit(500)

  if (tier) query = query.eq('risk_tier', tier)

  const { data: raw, error } = await query

  if (error) {
    console.error('[risk-scores] GET error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  type StudentInfo = { full_name: string; admission_no: string | null; class_name: string | null; gender: string | null }
  type RiskRow = {
    id: string; student_id: string; risk_probability: number; risk_tier: string
    attendance_score: number; grade_trend_score: number; grade_volatility: number
    discipline_score: number; engagement_score: number
    flags: string[]; recommendations: string[]; computed_at: string
    students: StudentInfo | null
  }

  const rows = (raw ?? []) as unknown as RiskRow[]

  // De-duplicate to latest per student
  const seen = new Map<string, RiskRow>()
  for (const r of rows) {
    if (!seen.has(r.student_id)) seen.set(r.student_id, r)
  }

  let students = Array.from(seen.values()).map(r => ({
    id:                 r.student_id,
    name:               r.students?.full_name ?? 'Unknown',
    admission_no:       r.students?.admission_no ?? '',
    class_name:         r.students?.class_name ?? '',
    gender:             r.students?.gender ?? '',
    risk_probability:   Math.round((r.risk_probability ?? 0) * 100),
    risk_tier:          r.risk_tier,
    attendance_score:   r.attendance_score,
    grade_trend_score:  r.grade_trend_score,
    grade_volatility:   r.grade_volatility,
    discipline_score:   r.discipline_score,
    engagement_score:   r.engagement_score,
    flags:              Array.isArray(r.flags) ? r.flags : [],
    recommendations:    Array.isArray(r.recommendations) ? r.recommendations : [],
    computed_at:        r.computed_at,
  }))

  if (cls) students = students.filter(s => s.class_name === cls)

  // Summary counts
  const tierCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const s of students) {
    const t = s.risk_tier as keyof typeof tierCounts
    if (t in tierCounts) tierCounts[t]++
  }

  const lastComputed = rows[0]?.computed_at ?? null

  return NextResponse.json({
    students,
    total: students.length,
    tierCounts,
    lastComputed,
  })
}

export async function POST(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal' && auth.subRole !== 'deputy_principal') {
    return NextResponse.json({ error: 'Principal or Deputy only' }, { status: 403 })
  }

  const db = svc()

  const { error } = await db.rpc('compute_risk_scores', { p_school_id: auth.schoolId })
  if (error) {
    console.error('[risk-scores] compute error:', error.message)
    return NextResponse.json({ error: 'Computation failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Risk scores recomputed successfully.' })
}

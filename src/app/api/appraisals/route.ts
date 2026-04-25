// POST /api/appraisals — submit a duty appraisal
// GET  /api/appraisals — list appraisals (teacher=own, HOD=dept, principal=all)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const MANAGEMENT_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'hod'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db     = svc()
  const termId = req.nextUrl.searchParams.get('term_id') ?? currentTermId()

  // Resolve caller's staff ID
  const { data: callerStaff } = await db
    .from('staff_records')
    .select('id, sub_role, department')
    .eq('user_id', auth.userId!)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!callerStaff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  type CallerRow = { id: string; sub_role: string; department: string | null }
  const cs = callerStaff as CallerRow

  let query = db
    .from('appraisals')
    .select(`
      id, duty_date, punctuality, incident_handling, report_quality,
      student_welfare, overall_rating, duty_notes, graded_via, appraisee_id,
      created_at, staff_records!appraisee_id(full_name, sub_role, department)
    `)
    .eq('school_id', auth.schoolId!)
    .eq('appraisal_type', 'duty')
    .order('duty_date', { ascending: false })
    .limit(200)

  if (auth.subRole === 'principal' || auth.subRole === 'deputy_principal') {
    // See all
  } else if (auth.subRole === 'hod' && cs.department) {
    // See own department
    const { data: deptStaff } = await db
      .from('staff_records')
      .select('id')
      .eq('school_id', auth.schoolId!)
      .eq('department', cs.department)
    const deptIds = (deptStaff ?? []).map((s: { id: string }) => s.id)
    query = query.in('appraisee_id', deptIds)
  } else {
    // Teacher sees only own
    query = query.eq('appraisee_id', cs.id)
  }

  const { data, error } = await query

  if (error) {
    console.error('[appraisals] GET error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Compute term summary per teacher
  type AppraisalRow = {
    id: string; duty_date: string; punctuality: number; incident_handling: number
    report_quality: number; student_welfare: number; overall_rating: string
    duty_notes: string; graded_via: string; appraisee_id: string
    staff_records: { full_name: string; sub_role: string; department: string | null } | null
  }

  const rows = (data ?? []) as unknown as AppraisalRow[]
  const teacherMap = new Map<string, { name: string; role: string; dept: string | null; rows: AppraisalRow[] }>()

  for (const row of rows) {
    if (!teacherMap.has(row.appraisee_id)) {
      teacherMap.set(row.appraisee_id, {
        name: row.staff_records?.full_name ?? 'Unknown',
        role: row.staff_records?.sub_role  ?? '',
        dept: row.staff_records?.department ?? null,
        rows: [],
      })
    }
    teacherMap.get(row.appraisee_id)!.rows.push(row)
  }

  const summary = Array.from(teacherMap.entries()).map(([staffId, t]) => {
    const n = t.rows.length
    const avg = (f: keyof AppraisalRow) =>
      n > 0 ? Math.round(t.rows.reduce((s, r) => s + ((r[f] as number) ?? 0), 0) / n * 10) / 10 : null

    const overall = avg('punctuality') !== null
      ? Math.round(
          ((avg('punctuality') ?? 0) * 0.25 +
           (avg('incident_handling') ?? 0) * 0.25 +
           (avg('report_quality') ?? 0) * 0.25 +
           (avg('student_welfare') ?? 0) * 0.25) * 10
        ) / 10
      : null

    return {
      staff_id:              staffId,
      staff_name:            t.name,
      sub_role:              t.role,
      department:            t.dept,
      term_id:               termId,
      avg_punctuality:       avg('punctuality'),
      avg_incident_handling: avg('incident_handling'),
      avg_report_quality:    avg('report_quality'),
      avg_student_welfare:   avg('student_welfare'),
      overall_score:         overall,
      total_duties:          n,
      last_graded:           t.rows[0]?.duty_date ?? null,
    }
  }).sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))

  return NextResponse.json({ appraisals: summary, total: rows.length })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!MANAGEMENT_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'HOD or above required to grade appraisals' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    dutyAssignmentId?:    string
    appraiseeId:          string
    dutyDate:             string
    punctuality:          number
    incidentHandling:     number
    reportQuality:        number
    studentWelfare:       number
    notes?:               string
  } | null

  if (!body?.appraiseeId || !body.dutyDate ||
      body.punctuality == null || body.incidentHandling == null ||
      body.reportQuality == null || body.studentWelfare == null) {
    return NextResponse.json({ error: 'appraiseeId, dutyDate, and all four scores required' }, { status: 400 })
  }

  const scoreFields = [body.punctuality, body.incidentHandling, body.reportQuality, body.studentWelfare]
  if (scoreFields.some(s => s < 1 || s > 10)) {
    return NextResponse.json({ error: 'Scores must be between 1 and 10' }, { status: 400 })
  }

  const overall = Math.round(
    (body.punctuality + body.incidentHandling + body.reportQuality + body.studentWelfare) / 4
  )

  const rating = overall >= 9 ? 'Excellent'
    : overall >= 7 ? 'Good'
    : overall >= 5 ? 'Satisfactory'
    : 'Needs Improvement'

  const db  = svc()
  const now = new Date().toISOString()

  // Resolve grader staff ID
  const { data: graderStaff } = await db
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId!)
    .eq('school_id', auth.schoolId!)
    .single()

  const graderId = (graderStaff as { id: string } | null)?.id

  const { data, error } = await db
    .from('appraisals')
    .insert({
      school_id:         auth.schoolId,
      appraisee_id:      body.appraiseeId,
      graded_by:         graderId ?? auth.userId,
      appraisal_type:    'duty',
      duty_date:         body.dutyDate,
      punctuality:       body.punctuality,
      incident_handling: body.incidentHandling,
      report_quality:    body.reportQuality,
      student_welfare:   body.studentWelfare,
      overall_rating:    rating,
      duty_notes:        body.notes?.trim() ?? null,
      graded_via:        body.dutyAssignmentId ? 'duty_assignment' : 'manual',
      created_at:        now,
    })
    .select('id, overall_rating')
    .single()

  if (error) {
    console.error('[appraisals] POST error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mark duty assignment as acknowledged
  if (body.dutyAssignmentId) {
    await db
      .from('duty_assignments')
      .update({ acknowledged: true })
      .eq('id', body.dutyAssignmentId)
      .eq('school_id', auth.schoolId!)
      .then(() => {}, () => {})
  }

  return NextResponse.json({
    ok:         true,
    appraisalId: (data as { id: string }).id,
    overall,
    rating,
  })
}

function currentTermId() {
  const now = new Date()
  const m   = now.getMonth() + 1
  const t   = m <= 4 ? 1 : m <= 8 ? 2 : 3
  return `${now.getFullYear()}-T${t}`
}

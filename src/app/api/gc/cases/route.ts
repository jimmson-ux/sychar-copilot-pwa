// GET  /api/gc/cases — list G&C cases (counselor sees own; principal sees summaries)
// POST /api/gc/cases — open a new case (counselor only)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['counselor', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = svc()

  // Principal sees non-sensitive Tier 2 fields only (no Tier 1 session content)
  const selectFields = auth.subRole === 'principal'
    ? 'id, student_id, status, category, referral_source, risk_level, opened_at, closed_at, session_count, students(full_name, class_name)'
    : 'id, student_id, status, category, referral_source, risk_level, opened_at, closed_at, last_session_date, session_count, presenting_issue, management_plan, students(full_name, class_name, admission_number), staff_records!counselor_id(full_name)'

  let query = db
    .from('counseling_cases')
    .select(selectFields)
    .eq('school_id', auth.schoolId!)
    .order('opened_at', { ascending: false })
    .limit(50)

  if (auth.subRole === 'counselor') {
    const { data: staff } = await db
      .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
    if (staff) query = query.eq('counselor_id', (staff as { id: string }).id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cases: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'counselor') {
    return NextResponse.json({ error: 'Forbidden: counselor only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:       string
    category:         string   // academic | behavioural | family | trauma | career | peer | other
    referral_source:  string   // self | teacher | parent | deputy | anonymous
    risk_level?:      string   // low | medium | high | crisis
    presenting_issue?: string  // Tier 2 — plaintext summary (no clinical detail here)
    management_plan?:  string  // Tier 2 — plaintext
  }

  if (!body.student_id || !body.category || !body.referral_source) {
    return NextResponse.json({ error: 'student_id, category, referral_source required' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  // Check for existing open case for this student
  const { data: existing } = await db
    .from('counseling_cases')
    .select('id, status')
    .eq('school_id', auth.schoolId!)
    .eq('student_id', body.student_id)
    .eq('status', 'active')
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Student already has an active case', case_id: (existing as { id: string }).id }, { status: 409 })
  }

  const { data, error } = await db
    .from('counseling_cases')
    .insert({
      school_id:        auth.schoolId,
      student_id:       body.student_id,
      counselor_id:     (staff as { id: string }).id,
      category:         body.category,
      referral_source:  body.referral_source,
      risk_level:       body.risk_level       ?? 'low',
      presenting_issue: body.presenting_issue ?? null,
      management_plan:  body.management_plan  ?? null,
      status:           'active',
      opened_at:        new Date().toISOString(),
      session_count:    0,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Alert principal on crisis risk level
  if (body.risk_level === 'crisis') {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'gc_crisis_case',
      severity:  'high',
      title:     `CRISIS: G&C case opened — immediate intervention may be required`,
      detail:    { case_id: (data as { id: string }).id, student_id: body.student_id },
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true, case_id: (data as { id: string }).id })
}

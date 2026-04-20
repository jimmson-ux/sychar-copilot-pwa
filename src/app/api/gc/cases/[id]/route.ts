// GET   /api/gc/cases/[id] — case detail (counselor owns; principal sees Tier 2 only)
// PATCH /api/gc/cases/[id] — update case (counselor only)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['counselor', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()

  const { data } = await db
    .from('counseling_cases')
    .select('id, student_id, counselor_id, status, category, referral_source, risk_level, opened_at, closed_at, last_session_date, session_count, presenting_issue, management_plan, students(full_name, class_name, admission_number, parent_phone, date_of_birth), staff_records!counselor_id(full_name)')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!data) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const c = data as unknown as {
    id: string; student_id: string; counselor_id: string; status: string;
    category: string; referral_source: string; risk_level: string;
    opened_at: string; closed_at: string | null; last_session_date: string | null;
    session_count: number; presenting_issue: string | null; management_plan: string | null;
    students: { full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null; date_of_birth: string | null } | null;
    staff_records: { full_name: string } | null;
  }

  if (auth.subRole === 'counselor') {
    const { data: staff } = await db
      .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
    if (!staff || (staff as { id: string }).id !== c.counselor_id) {
      return NextResponse.json({ error: 'Forbidden: not your case' }, { status: 403 })
    }
  }

  // Principal: strip presenting_issue and management_plan unless authorized
  if (auth.subRole === 'principal') {
    const now = new Date().toISOString()
    const { data: accessRow } = await db
      .from('gc_access_log')
      .select('id')
      .eq('case_id', id)
      .eq('school_id', auth.schoolId!)
      .not('authorized_at', 'is', null)
      .gt('expires_at', now)
      .limit(1)
      .single()

    if (!accessRow) {
      // Return summary only
      return NextResponse.json({
        case: {
          id: c.id, student_id: c.student_id, status: c.status, category: c.category,
          referral_source: c.referral_source, risk_level: c.risk_level,
          opened_at: c.opened_at, session_count: c.session_count,
          students: c.students,
          _restricted: true,
          _message: 'Request counselor authorization to view case details and session notes.',
        },
      })
    }

    // Log principal access to this case
    await db.from('gc_access_log').insert({
      school_id:     auth.schoolId,
      case_id:       id,
      accessed_by:   auth.userId,
      accessor_role: 'principal',
      accessed_at:   new Date().toISOString(),
      action:        'read_case',
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ case: c })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'counselor') {
    return NextResponse.json({ error: 'Forbidden: counselor only' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()
  const body   = await req.json() as {
    status?:           string  // active | closed | referred_out | on_hold
    risk_level?:       string
    presenting_issue?: string
    management_plan?:  string
    close_reason?:     string
  }

  const { data: existing } = await db
    .from('counseling_cases')
    .select('id, counselor_id, status')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff || (staff as { id: string }).id !== (existing as { counselor_id: string }).counselor_id) {
    return NextResponse.json({ error: 'Forbidden: not your case' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  if (body.status           !== undefined) {
    updates.status = body.status
    if (body.status === 'closed') {
      updates.closed_at    = new Date().toISOString()
      updates.close_reason = body.close_reason ?? 'Counselor closed'
    }
  }
  if (body.risk_level       !== undefined) updates.risk_level       = body.risk_level
  if (body.presenting_issue !== undefined) updates.presenting_issue = body.presenting_issue
  if (body.management_plan  !== undefined) updates.management_plan  = body.management_plan

  await db.from('counseling_cases').update(updates).eq('id', id)

  // Escalate if risk changed to crisis
  if (body.risk_level === 'crisis') {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'gc_crisis_escalation',
      severity:  'high',
      title:     `CRISIS ESCALATION: G&C case risk level raised to CRISIS`,
      detail:    { case_id: id },
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true })
}

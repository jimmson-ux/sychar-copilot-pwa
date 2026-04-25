// POST /api/gc/access-request — principal requests 30-min access window to a G&C case
// Notifies counselor via alert; counselor must authorize via PATCH /[id]

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as { case_id: string; reason: string }

  if (!body.case_id || !body.reason?.trim()) {
    return NextResponse.json({ error: 'case_id and reason required' }, { status: 400 })
  }

  // Verify case belongs to school
  const { data: gc_case } = await db
    .from('counseling_cases')
    .select('id, student_id, counselor_id, status, students(full_name, class_name)')
    .eq('id', body.case_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!gc_case) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const c = gc_case as unknown as {
    id: string; student_id: string; counselor_id: string; status: string;
    students: { full_name: string; class_name: string } | null;
  }

  // Check for pending request already open
  const { data: pending } = await db
    .from('gc_access_log')
    .select('id')
    .eq('case_id', body.case_id)
    .eq('school_id', auth.schoolId!)
    .is('authorized_at', null)
    .is('declined_at', null)
    .limit(1)
    .single()

  if (pending) {
    return NextResponse.json({ error: 'Access request already pending for this case' }, { status: 409 })
  }

  // Create access request log entry (no authorized_at yet)
  const { data: logEntry, error } = await db
    .from('gc_access_log')
    .insert({
      school_id:     auth.schoolId,
      case_id:       body.case_id,
      requested_by:  auth.userId,
      accessor_role: 'principal',
      request_reason: body.reason.trim(),
      requested_at:  new Date().toISOString(),
      action:        'access_requested',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Alert the counselor
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'gc_access_requested',
    severity:  'high',
    title:     `Principal requesting access to G&C case: ${c.students?.full_name ?? 'Student'} (${c.students?.class_name ?? ''})`,
    detail:    {
      access_log_id: (logEntry as { id: string }).id,
      case_id:       body.case_id,
      reason:        body.reason,
    },
  }).then(() => {}, () => {})

  return NextResponse.json({
    ok:            true,
    access_log_id: (logEntry as { id: string }).id,
    message:       'Access request sent to counselor. They must authorize before you can view session notes.',
  })
}

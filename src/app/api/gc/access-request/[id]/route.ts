// PATCH /api/gc/access-request/[id] — counselor authorizes or declines principal access
// Authorizing opens a 30-minute read window; sets expires_at

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
  const body   = await req.json() as { action: 'authorize' | 'decline'; decline_reason?: string }

  if (!body.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  // Fetch the access log entry
  const { data: logEntry } = await db
    .from('gc_access_log')
    .select('id, case_id, school_id, authorized_at, declined_at')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!logEntry) return NextResponse.json({ error: 'Access request not found' }, { status: 404 })

  const entry = logEntry as { id: string; case_id: string; school_id: string; authorized_at: string | null; declined_at: string | null }

  if (entry.authorized_at || entry.declined_at) {
    return NextResponse.json({ error: 'Request already actioned' }, { status: 409 })
  }

  // Verify counselor owns the case
  const { data: gc_case } = await db
    .from('counseling_cases')
    .select('counselor_id')
    .eq('id', entry.case_id)
    .eq('school_id', auth.schoolId!)
    .single()

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  if (!gc_case || !staff || (gc_case as { counselor_id: string }).counselor_id !== (staff as { id: string }).id) {
    return NextResponse.json({ error: 'Forbidden: not your case' }, { status: 403 })
  }

  const now = new Date()

  if (body.action === 'authorize') {
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString() // 30 minutes

    await db.from('gc_access_log').update({
      authorized_at: now.toISOString(),
      authorized_by: auth.userId,
      expires_at:    expiresAt,
      action:        'access_authorized',
    }).eq('id', id)

    // Notify principal
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'gc_access_authorized',
      severity:  'medium',
      title:     `G&C access authorized — 30-minute window open. Access expires at ${new Date(expiresAt).toLocaleTimeString('en-KE')}`,
      detail:    { access_log_id: id, case_id: entry.case_id, expires_at: expiresAt },
    }).then(() => {}, () => {})

    return NextResponse.json({ ok: true, action: 'authorized', expires_at: expiresAt })
  }

  // Decline
  await db.from('gc_access_log').update({
    declined_at:     now.toISOString(),
    declined_by:     auth.userId,
    decline_reason:  body.decline_reason ?? 'No reason given',
    action:          'access_declined',
  }).eq('id', id)

  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'gc_access_declined',
    severity:  'low',
    title:     `G&C access request declined by counselor`,
    detail:    { access_log_id: id, case_id: entry.case_id },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, action: 'declined' })
}

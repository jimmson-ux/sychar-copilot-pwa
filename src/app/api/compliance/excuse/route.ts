// POST /api/compliance/excuse — principal only
// Marks specific compliance items as excused for a teacher and logs the action.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendSMS } from '@/lib/sms'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const VALID_ITEMS = new Set(['scheme_submitted', 'lesson_plan_submitted', 'record_of_work_current'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    teacherId:    string
    term:         string
    academicYear: string
    reason:       string
    excusedItems: string[]
  } | null

  if (!body?.teacherId || !body.term || !body.academicYear || !body.reason?.trim() || !body.excusedItems?.length) {
    return NextResponse.json(
      { error: 'teacherId, term, academicYear, reason, excusedItems required' },
      { status: 400 }
    )
  }

  const invalid = body.excusedItems.filter(i => !VALID_ITEMS.has(i))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Invalid excusedItems: ${invalid.join(', ')}` }, { status: 400 })
  }

  const db = svc()

  const { data: teacher } = await db
    .from('staff_records')
    .select('id, full_name, phone_number')
    .eq('id', body.teacherId)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

  const t = teacher as { id: string; full_name: string; phone_number: string | null }

  const now     = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  for (const item of body.excusedItems) {
    switch (item) {
      case 'scheme_submitted':
        updates.scheme_submitted    = true
        updates.scheme_submitted_at = now
        break
      case 'lesson_plan_submitted':
        updates.lesson_plan_submitted    = true
        updates.lesson_plan_submitted_at = now
        break
      case 'record_of_work_current':
        updates.record_of_work_current = true
        break
    }
  }

  const { error: upsertErr } = await db
    .from('document_compliance')
    .upsert({
      school_id:     auth.schoolId,
      teacher_id:    body.teacherId,
      term:          Number(body.term),
      academic_year: body.academicYear,
      ...updates,
    }, { onConflict: 'teacher_id,term,academic_year' })

  if (upsertErr) {
    console.error('[compliance/excuse] upsert error:', upsertErr.message)
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // Audit log
  await db.from('system_logs').insert({
    school_id:   auth.schoolId,
    actor_id:    auth.userId,
    action:      'compliance_excuse',
    entity_type: 'document_compliance',
    entity_id:   body.teacherId,
    metadata:    { reason: body.reason, excusedItems: body.excusedItems, term: body.term, academicYear: body.academicYear },
    created_at:  now,
  }).then(() => {}, () => {})

  // SMS teacher
  if (t.phone_number) {
    const labels = body.excusedItems.map(i => i.replace(/_/g, ' ')).join(', ')
    await sendSMS(
      t.phone_number,
      `Sychar Compliance [${body.term}/${body.academicYear}]: Your ${labels} has been excused by the Principal. Reason: ${body.reason.slice(0, 120)}`
    )
  }

  return NextResponse.json({ ok: true, excusedItems: body.excusedItems })
}

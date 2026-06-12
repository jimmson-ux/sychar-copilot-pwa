import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/nurse/followup — pending follow-ups + mark a follow-up complete (nurse only).
 *   GET  → due follow-ups (students named; staff aggregate-confidential)
 *   PATCH→ { visit_id, kind: 'student'|'staff' }  marks followup_done = true
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'nurse') return NextResponse.json({ error: 'Forbidden: nurse only' }, { status: 403 })

  const svc = createAdminSupabaseClient()
  const nowIso = new Date().toISOString()

  const [{ data: students }, { data: staff }] = await Promise.all([
    svc.from('sick_bay_visits')
      .select('id, complaint, follow_up_plan, followup_due_at, students:student_id(full_name, class_name)')
      .eq('school_id', auth.schoolId).eq('followup_done', false).not('followup_due_at', 'is', null).lte('followup_due_at', nowIso)
      .order('followup_due_at').limit(100),
    svc.from('staff_patient_visits')
      .select('id, complaint, follow_up_plan, followup_due_at')
      .eq('school_id', auth.schoolId).eq('followup_done', false).not('followup_due_at', 'is', null).lte('followup_due_at', nowIso)
      .order('followup_due_at').limit(100),
  ])

  return NextResponse.json({ students: students ?? [], staff: staff ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'nurse') return NextResponse.json({ error: 'Forbidden: nurse only' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { visit_id?: string; kind?: string }
  if (!body.visit_id || (body.kind !== 'student' && body.kind !== 'staff')) {
    return NextResponse.json({ error: 'visit_id and kind (student|staff) required' }, { status: 400 })
  }
  const table = body.kind === 'student' ? 'sick_bay_visits' : 'staff_patient_visits'

  const svc = createAdminSupabaseClient()
  const { error } = await svc.from(table)
    .update({ followup_done: true })
    .eq('id', body.visit_id)
    .eq('school_id', auth.schoolId)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

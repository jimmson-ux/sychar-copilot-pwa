import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/attendance/reconcile
 *
 * Called on Record-of-Work / lesson sign-off with the present count. If a lesson
 * is marked complete but attendance is low (< threshold of class size), raise a
 * lesson_attendance_alert and push the Deputy Academic a remedial-block flag.
 *
 * Body: { class_name, subject, roll_present, roll_total?, period_id?, threshold? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    class_name?: string; subject?: string; roll_present?: number; roll_total?: number
    period_id?: string; threshold?: number
  }
  if (!body.class_name || body.roll_present == null) {
    return NextResponse.json({ error: 'class_name and roll_present required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Class size: prefer supplied roll_total, else count active students in the class.
  let total = body.roll_total
  if (!total) {
    const { count } = await svc.from('students').select('id', { count: 'exact', head: true })
      .eq('school_id', auth.schoolId).eq('class_name', body.class_name).eq('is_active', true)
    total = count ?? 0
  }
  const threshold = body.threshold ?? 0.6
  const ratio = total ? body.roll_present / total : 1
  const low = total > 0 && ratio < threshold

  if (!low) {
    return NextResponse.json({ ok: true, low_attendance: false, ratio: Math.round(ratio * 100) / 100 })
  }

  const { data: teacher } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()

  await svc.from('lesson_attendance_alerts').insert({
    school_id: auth.schoolId,
    timetable_slot_id: body.period_id ?? null,
    allocated_teacher_id: (teacher as { id: string } | null)?.id ?? null,
    class_stream_id: null,
    resolution_status: 'Active_Unattended',
    alert_time: new Date().toISOString(),
  }).then(() => {}, () => {})

  // Flag the Deputy Academic: a large portion missed the lesson → remedial block.
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      audience: 'role', value: ['deputy_principal_academic', 'deputy_principal', 'principal'], school_id: auth.schoolId,
      payload: {
        title: 'Low lesson attendance',
        body: `${body.class_name} ${body.subject ?? ''}: only ${body.roll_present}/${total} present (${Math.round(ratio * 100)}%). Consider a remedial block.`,
        url: '/dashboard/deputy-academic', tag: 'attendance-reconcile', renotify: true,
      },
    }),
  }).catch(() => {})

  return NextResponse.json({ ok: true, low_attendance: true, ratio: Math.round(ratio * 100) / 100, present: body.roll_present, total })
}

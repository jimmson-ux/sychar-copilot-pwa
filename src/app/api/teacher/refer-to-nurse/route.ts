import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/teacher/refer-to-nurse  (optional)
 *
 * A teacher refers a student to the school nurse. The nurse is web-pushed; the
 * actual visit (and its time) is logged by the nurse on arrival via /api/nurse/visits.
 *
 * Body: { student_id?, student_name, reason }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as { student_id?: string; student_name?: string; reason?: string }
  if (!body.student_name?.trim() || !body.reason?.trim()) {
    return NextResponse.json({ error: 'student_name and reason required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()
  const { data: teacher } = await svc.from('staff_records').select('id, full_name').eq('user_id', auth.userId).single()
  const teacherName = (teacher as { full_name: string } | null)?.full_name ?? 'A teacher'

  await svc.from('alerts').insert({
    school_id: auth.schoolId,
    type: 'nurse_referral',
    severity: 'low',
    title: `Nurse referral: ${body.student_name.trim()}`,
    detail: { student_id: body.student_id ?? null, reason: body.reason.trim(), referred_by: teacherName },
  }).then(() => {}, () => {})

  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      audience: 'role', value: ['nurse'], school_id: auth.schoolId,
      payload: { title: 'Student referred to sick bay', body: `${body.student_name.trim()} sent by ${teacherName}: ${body.reason.trim()}`, url: '/dashboard/nurse', tag: 'nurse-referral', renotify: true },
    }),
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

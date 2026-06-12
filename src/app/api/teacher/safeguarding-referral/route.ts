import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/teacher/safeguarding-referral
 *
 * Any teacher can escalate a student to the school's Guidance & Counselling desk
 * for an immediate individual check-in (the "Immediate Safeguarding Referrals"
 * block). Writes to counselor_self_referrals and web-pushes the counselor.
 * An automatic digital signature (teacher name + timestamp) is recorded.
 *
 * Body: { student_id?, student_name, reason, urgency?: 'low'|'medium'|'high' }
 */
const URGENCIES = new Set(['low', 'medium', 'high'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    student_id?: string; student_name?: string; reason?: string; urgency?: string
  }
  if (!body.student_name?.trim() || !body.reason?.trim()) {
    return NextResponse.json({ error: 'student_name and reason are required' }, { status: 400 })
  }
  const urgency = URGENCIES.has(body.urgency ?? '') ? body.urgency! : 'medium'

  const svc = createAdminSupabaseClient()

  const { data: teacher } = await svc
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId)
    .single()
  const teacherName = (teacher as { full_name: string } | null)?.full_name ?? 'Teacher'
  const now = new Date()
  const signature = `${teacherName} — ${now.toISOString()} (digital)`

  const { data: ref, error } = await svc
    .from('counselor_self_referrals')
    .insert({
      school_id: auth.schoolId,
      student_id: body.student_id ?? null,
      student_name: body.student_name.trim(),
      urgency,
      topic: 'Teacher safeguarding referral',
      note: `${body.reason.trim()}\n\n— Referred by ${signature}`,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[safeguarding-referral]', error)
    return NextResponse.json({ error: 'Failed to submit referral' }, { status: 500 })
  }

  // Push the school's counselor (and dean as backup).
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      audience: 'role',
      value: ['guidance_counselling', 'counselor', 'dean_of_students'],
      school_id: auth.schoolId,
      payload: {
        title: `Safeguarding referral (${urgency})`,
        body: `${body.student_name.trim()} flagged by ${teacherName} for an immediate check-in.`,
        url: '/dashboard/counselor',
        tag: 'safeguarding',
        renotify: true,
      },
    }),
  }).catch(() => {})

  return NextResponse.json({ ok: true, referral_id: (ref as { id: string }).id, signature })
}

// GET /api/emergency-broadcast/[id] — confirmation status for a broadcast
// Real-time: X/Y confirmed (Z%), list of unconfirmed for manual calls after 60 min

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'deputy'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db = svc()

  // Fetch broadcast — must belong to this school
  const { data: broadcast } = await db
    .from('emergency_broadcasts')
    .select('id, type, message, total_recipients, sent_count, sent_at, sms_fallback_sent_at, created_at')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  const b = broadcast as {
    id: string; type: string; message: string;
    total_recipients: number; sent_count: number;
    sent_at: string | null; sms_fallback_sent_at: string | null; created_at: string
  }

  // Confirmed phones
  const { data: confirmations } = await db
    .from('emergency_confirmations')
    .select('parent_phone, student_id, confirmed_at')
    .eq('broadcast_id', id)
    .order('confirmed_at')

  const confirmed = (confirmations ?? []) as Array<{ parent_phone: string; student_id: string | null; confirmed_at: string }>
  const confirmedPhones = new Set(confirmed.map(c => c.parent_phone))

  // All recipients (active parent sessions in this school)
  const { data: sessions } = await db
    .from('parent_bot_sessions')
    .select('phone, active_student_id')
    .eq('school_id', auth.schoolId!)
    .eq('state', 'active')
    .eq('consent_given', true)

  const allRecipients = (sessions ?? []) as Array<{ phone: string; active_student_id: string | null }>
  const unconfirmed = allRecipients.filter(s => !confirmedPhones.has(s.phone))

  // After 60 min: fetch student names for manual call list
  const minutesSinceSent = b.sent_at
    ? (Date.now() - new Date(b.sent_at).getTime()) / 60000
    : 0

  let unconfirmedWithNames: Array<{ phone: string; student_name: string | null; class_name: string | null }> = []
  if (minutesSinceSent >= 60 && unconfirmed.length > 0) {
    const studentIds = unconfirmed
      .map(u => u.active_student_id)
      .filter(Boolean) as string[]

    const { data: students } = await db
      .from('students')
      .select('id, full_name, class_name')
      .eq('school_id', auth.schoolId!)
      .in('id', studentIds)

    const studentMap = new Map(
      ((students ?? []) as Array<{ id: string; full_name: string; class_name: string }>)
        .map(s => [s.id, s])
    )

    unconfirmedWithNames = unconfirmed.map(u => ({
      phone:        u.phone,
      student_name: u.active_student_id ? (studentMap.get(u.active_student_id)?.full_name ?? null) : null,
      class_name:   u.active_student_id ? (studentMap.get(u.active_student_id)?.class_name ?? null) : null,
    }))
  }

  return NextResponse.json({
    broadcast: {
      id:               b.id,
      type:             b.type,
      message:          b.message,
      sent_at:          b.sent_at,
      sms_fallback_sent_at: b.sms_fallback_sent_at,
    },
    total_recipients:    b.sent_count,
    confirmed_count:     confirmed.length,
    unconfirmed_count:   unconfirmed.length,
    confirmation_pct:    b.sent_count > 0 ? Math.round((confirmed.length / b.sent_count) * 100) : 0,
    minutes_since_sent:  Math.round(minutesSinceSent),
    sms_fallback_due:    minutesSinceSent >= 30 && !b.sms_fallback_sent_at,
    manual_calls_due:    minutesSinceSent >= 60,
    unconfirmed_for_calls: unconfirmedWithNames,
    recent_confirmations: confirmed.slice(-10).reverse(),
  })
}

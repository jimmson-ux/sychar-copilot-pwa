// POST /api/broadcast/emergency — principal-only emergency broadcast via SMS + realtime

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendBulkSMS } from '@/lib/sms'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_TYPES = new Set([
  'school_closure', 'lockdown', 'health_emergency',
  'government_directive', 'infrastructure', 'natural_disaster',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    type:           string
    message:        string
    targetAudience: 'all_parents' | 'all_staff' | 'both'
  } | null

  if (!body?.type || !body.message?.trim() || !body.targetAudience) {
    return NextResponse.json({ error: 'type, message, targetAudience required' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(body.type)) {
    return NextResponse.json({
      error: `type must be one of: ${[...ALLOWED_TYPES].join(', ')}`,
    }, { status: 400 })
  }

  if (!['all_parents', 'all_staff', 'both'].includes(body.targetAudience)) {
    return NextResponse.json({ error: 'targetAudience must be all_parents, all_staff, or both' }, { status: 400 })
  }

  const message = body.message.trim().slice(0, 640)
  const db = svc()

  const { data: school } = await db
    .from('schools')
    .select('name')
    .eq('id', auth.schoolId!)
    .single()

  const schoolName  = (school as { name: string } | null)?.name ?? 'School'
  const fullMessage = `[${schoolName} ALERT] ${message}`

  let parentPhones: string[] = []
  let staffPhones:  string[] = []

  if (body.targetAudience === 'all_parents' || body.targetAudience === 'both') {
    const { data: students } = await db
      .from('students')
      .select('parent_phone')
      .eq('school_id', auth.schoolId!)
      .not('parent_phone', 'is', null)

    parentPhones = [...new Set(
      (students ?? [])
        .map((s: { parent_phone: string | null }) => s.parent_phone)
        .filter(Boolean) as string[]
    )]
  }

  if (body.targetAudience === 'all_staff' || body.targetAudience === 'both') {
    const { data: staff } = await db
      .from('staff_records')
      .select('phone')
      .eq('school_id', auth.schoolId!)
      .eq('is_active', true)
      .not('phone', 'is', null)

    staffPhones = [
      ...new Set(
        (staff ?? [])
          .map((s: { phone: string | null }) => s.phone)
          .filter(Boolean) as string[]
      ),
    ]
  }

  const allPhones     = [...new Set([...parentPhones, ...staffPhones])]
  const recipientCount = allPhones.length

  // Fire-and-forget bulk SMS
  let smsCount = 0
  if (allPhones.length > 0) {
    const { sent } = await sendBulkSMS(allPhones, fullMessage, { batchSize: 50, delayMs: 300 })
    smsCount = sent
  }

  // Log to emergency_broadcasts
  const { data: broadcast, error: logErr } = await db
    .from('emergency_broadcasts')
    .insert({
      school_id:       auth.schoolId,
      broadcast_type:  body.type,
      message:         fullMessage,
      target_audience: body.targetAudience,
      recipient_count: recipientCount,
      sms_count:       smsCount,
      sent_by:         auth.userId,
      sent_at:         new Date().toISOString(),
    })
    .select('id')
    .single()

  if (logErr) {
    console.error('[broadcast/emergency] log error:', logErr.message)
  }

  return NextResponse.json({
    ok:              true,
    broadcastId:     (broadcast as { id: string } | null)?.id ?? null,
    recipientCount,
    smsCount,
    parentCount:     parentPhones.length,
    staffCount:      staffPhones.length,
  })
}

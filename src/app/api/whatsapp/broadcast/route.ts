// POST /api/whatsapp/broadcast
// Sends a WhatsApp broadcast message to all parents (or a specific class).
// Principal and Gerald (hod_pathways) only.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { z } from 'zod'

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const BroadcastSchema = z.object({
  message:   z.string().min(5).max(1000),
  target:    z.enum(['all_parents', 'all_staff', 'class']).default('all_parents'),
  className: z.string().optional(), // required if target === 'class'
})

async function sendWA(to: string, body: string, waToken: string, waPhoneId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!['principal', 'hod_pathways'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const waToken    = process.env.WHATSAPP_API_TOKEN
  const waPhoneId  = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!waToken || !waPhoneId) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BroadcastSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { message, target, className } = parsed.data
  const sb = getSb()

  const phones = new Set<string>()

  if (target === 'all_parents' || target === 'class') {
    let query = sb
      .from('students')
      .select('parent_phone, parent_phone2')
      .eq('school_id', auth.schoolId)
      .eq('is_active', true)

    if (target === 'class' && className) {
      query = query.eq('class_name', className)
    }

    const { data: students } = await query
    for (const s of students ?? []) {
      if (s.parent_phone) phones.add(s.parent_phone.replace(/\D/g, '').slice(-9))
      if (s.parent_phone2) phones.add(s.parent_phone2.replace(/\D/g, '').slice(-9))
    }
  }

  if (target === 'all_staff') {
    const { data: staff } = await sb
      .from('staff_records')
      .select('phone')
      .eq('school_id', auth.schoolId)
      .eq('is_active', true)
      .not('phone', 'is', null)

    for (const s of staff ?? []) {
      if (s.phone) phones.add(s.phone.replace(/\D/g, '').slice(-9))
    }
  }

  const broadcastText = `📢 *Taarifa kutoka shule:*\n\n${message}`
  let sent = 0
  let failed = 0

  for (const p of phones) {
    const ok = await sendWA(`254${p}`, broadcastText, waToken, waPhoneId)
    if (ok) sent++
    else failed++

    // Log outbound
    await sb.from('sms_log').insert({
      school_id: auth.schoolId,
      direction: 'outbound',
      phone:     `254${p}`,
      message:   message,
      intent:    'broadcast',
    })
  }

  return NextResponse.json({ success: true, sent, failed, total: phones.size })
}

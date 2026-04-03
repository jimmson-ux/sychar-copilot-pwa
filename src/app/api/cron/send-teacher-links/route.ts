// GET /api/cron/send-teacher-links
// Scheduled cron — sends WhatsApp magic links to all active teachers with phones.
// Vercel cron calls this with Authorization: Bearer <CRON_SECRET>.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID ?? '68bd8d34-f2f0-4297-bd18-093328824d84'
const BASE_URL  = process.env.NEXT_PUBLIC_APP_URL   ?? 'https://project-o7htk.vercel.app'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const waToken   = process.env.WHATSAPP_API_TOKEN
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!waToken || !waPhoneId) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 })
  }

  const sb = getSb()

  // Fetch active teachers with phone numbers
  // class_teacher is a logged-in dashboard user — does not need a magic link
  const { data: teachers, error } = await sb
    .from('staff_records')
    .select('id, full_name, phone, subject_specialization, assigned_class_name')
    .eq('school_id', SCHOOL_ID)
    .in('sub_role', ['bom_teacher','hod_sciences','hod_mathematics','hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports','hod_subjects','hod_pathways'])
    .eq('is_active', true)
    .not('phone', 'is', null)

  if (error || !teachers) {
    return NextResponse.json({ error: 'Failed to load teachers' }, { status: 500 })
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  let sent = 0
  let failed = 0

  for (const teacher of teachers) {
    if (!teacher.phone) continue

    const token = randomBytes(24).toString('hex')

    const { error: tokenErr } = await sb.from('teacher_tokens').insert({
      token,
      teacher_id:   teacher.id,
      school_id:    SCHOOL_ID,
      subject_name: teacher.subject_specialization,
      class_name:   teacher.assigned_class_name,
      // ↑ teacher_tokens table uses subject_name/class_name (not staff_records column names)
      expires_at:   expiresAt,
      is_active:    true,
      sent_via:     'whatsapp',
    })

    if (tokenErr) { failed++; continue }

    const link  = `${BASE_URL}/record?token=${token}`
    const phone = `254${teacher.phone.replace(/\D/g, '').slice(-9)}`
    const msg   = `Habari ${teacher.full_name}! Bonyeza kiungo hiki kurekodi kazi yako ya wiki hii:\n\n${link}\n\n_(Kitaisha baada ya siku 7)_ ✅`

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: msg },
        }),
      })

      if (res.ok) {
        sent++
        await sb.from('sms_log').insert({
          school_id:  SCHOOL_ID,
          direction:  'outbound',
          phone,
          message:    msg,
          intent:     'teacher_link',
        })
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  return NextResponse.json({ success: true, sent, failed, total: teachers.length })
}

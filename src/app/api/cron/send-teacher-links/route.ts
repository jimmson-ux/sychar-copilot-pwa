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

// Per-school record link base URL. Schools carry a `subdomain` (e.g. `pceamatasia`,
// `oloolaiser`) → https://<subdomain>.sychar.co.ke. Nkoroi has no subdomain yet, so fall
// back to the env default to preserve its existing behaviour.
const FALLBACK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://project-o7htk.vercel.app'
function baseUrlFor(subdomain: string | null): string {
  return subdomain ? `https://${subdomain}.sychar.co.ke` : FALLBACK_BASE_URL
}

// Teacher roles that receive a WhatsApp record link. class_teacher is a logged-in dashboard
// user → does not need a magic link.
const LINK_ROLES = ['bom_teacher','hod_sciences','hod_mathematics','hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports','hod_subjects','hod_pathways']

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

  // Multi-tenant: process every active school. Previously hardwired to NEXT_PUBLIC_SCHOOL_ID
  // (Nkoroi), so other tenants (e.g. PCEA Upper Matasia) never received teacher links.
  const { data: schools, error: schoolErr } = await sb
    .from('schools')
    .select('id, subdomain')
    .eq('is_active', true)

  if (schoolErr || !schools) {
    return NextResponse.json({ error: 'Failed to load schools' }, { status: 500 })
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const perSchool: Array<{ school_id: string; sent: number; failed: number; total: number }> = []
  let totalSent = 0
  let totalFailed = 0

  for (const school of schools as { id: string; subdomain: string | null }[]) {
    const baseUrl = baseUrlFor(school.subdomain)

    // Active teachers with phone numbers for this school.
    const { data: teachers, error } = await sb
      .from('staff_records')
      .select('id, full_name, phone, subject_specialization, assigned_class_name')
      .eq('school_id', school.id)
      .in('sub_role', LINK_ROLES)
      .eq('is_active', true)
      .not('phone', 'is', null)

    if (error || !teachers) {
      perSchool.push({ school_id: school.id, sent: 0, failed: 0, total: 0 })
      continue
    }

    let sent = 0
    let failed = 0

    for (const teacher of teachers) {
      if (!teacher.phone) continue

      const token = randomBytes(24).toString('hex')

      const { error: tokenErr } = await sb.from('teacher_tokens').insert({
        token,
        teacher_id:   teacher.id,
        school_id:    school.id,
        subject_name: teacher.subject_specialization,
        class_name:   teacher.assigned_class_name,
        // ↑ teacher_tokens table uses subject_name/class_name (not staff_records column names)
        expires_at:   expiresAt,
        is_active:    true,
        sent_via:     'whatsapp',
      })

      if (tokenErr) { failed++; continue }

      const link  = `${baseUrl}/record?token=${token}`
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
            school_id:  school.id,
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

    perSchool.push({ school_id: school.id, sent, failed, total: teachers.length })
    totalSent += sent
    totalFailed += failed
  }

  return NextResponse.json({ success: true, sent: totalSent, failed: totalFailed, schools: perSchool })
}

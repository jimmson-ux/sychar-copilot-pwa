import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { randomBytes } from 'crypto'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface TeacherRow {
  id: string
  full_name: string
  phone: string | null
  subject_specialization: string | null
  assigned_class_name: string | null
}

export async function POST() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sb = getClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sychar.vercel.app'
  const waToken = process.env.WHATSAPP_API_TOKEN
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!waToken || !waPhoneId) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 })
  }

  // Fetch all active teachers with phone numbers
  const { data: teachers, error } = await sb
    .from('staff_records')
    .select('id, full_name, phone, subject_specialization, assigned_class_name')
    .eq('school_id', auth.schoolId)
    // class_teacher is a logged-in dashboard user — does not need a magic link
    .in('sub_role', ['bom_teacher','hod_sciences','hod_mathematics','hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports','hod_subjects','hod_pathways'])
    .eq('is_active', true)
    .not('phone', 'is', null) as { data: TeacherRow[] | null; error: unknown }

  if (error || !teachers) {
    return NextResponse.json({ error: 'Failed to load teachers' }, { status: 500 })
  }

  const results: { teacherName: string; sent: boolean; error?: string }[] = []
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  for (const teacher of teachers) {
    if (!teacher.phone) continue

    // Generate magic link token
    const token = randomBytes(24).toString('hex')

    const { error: tokenErr } = await sb.from('teacher_tokens').insert({
      token,
      teacher_id:  teacher.id,
      school_id:   auth.schoolId,
      subject_name: teacher.subject_specialization,
      class_name:  teacher.assigned_class_name,
      expires_at:  expiresAt,
      is_active:   true,
      sent_via:    'whatsapp',
    })

    if (tokenErr) {
      results.push({ teacherName: teacher.full_name, sent: false, error: tokenErr.message })
      continue
    }

    const link = `${baseUrl}/record?token=${token}`
    const phone = teacher.phone.replace(/\D/g, '')
    const msg = `Habari ${teacher.full_name}! Bonyeza kiungo hiki kurekodi kazi yako ya wiki hii: ${link}\n\n_(Kiungo kitaisha baada ya siku 7)_`

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: `254${phone.slice(-9)}`,
          type: 'text',
          text: { body: msg },
        }),
      })

      if (res.ok) {
        results.push({ teacherName: teacher.full_name, sent: true })
      } else {
        const errBody = await res.text()
        results.push({ teacherName: teacher.full_name, sent: false, error: errBody })
      }
    } catch (e) {
      results.push({ teacherName: teacher.full_name, sent: false, error: String(e) })
    }
  }

  const sent = results.filter(r => r.sent).length
  const failed = results.filter(r => !r.sent).length

  return NextResponse.json({ success: true, sent, failed, results })
}

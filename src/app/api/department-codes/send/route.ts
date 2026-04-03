import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { z } from 'zod'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SendSchema = z.object({
  departmentCodeId: z.string().uuid(),
  term: z.enum(['Term 1', 'Term 2', 'Term 3']),
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'hod_pathways', 'hod_subjects'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { departmentCodeId, term } = parsed.data
  const sb = getClient()
  const waToken = process.env.WHATSAPP_API_TOKEN
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!waToken || !waPhoneId) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 })
  }

  // Get department info
  const { data: dept } = await sb
    .from('department_codes')
    .select('department, code, subjects')
    .eq('id', departmentCodeId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

  // Find all teachers in this department
  const { data: staff } = await sb
    .from('staff_records')
    .select('full_name, phone, subject_specialization')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)
    .in('subject_specialization', dept.subjects as string[])
    .not('phone', 'is', null) as { data: { full_name: string; phone: string; subject_specialization: string }[] | null }

  if (!staff || staff.length === 0) {
    return NextResponse.json({ error: 'No teachers with phone numbers found in this department' }, { status: 404 })
  }

  const results: { name: string; sent: boolean }[] = []
  const schoolName = 'Nkoroi Mixed Day Secondary School'

  for (const teacher of staff) {
    const phone = teacher.phone.replace(/\D/g, '')
    const msg = `Your Sychar Copilot department code for ${term} is: *${dept.code}*\n\nUse this when accessing the teacher portal at sychar.vercel.app/record\n\nKeep this code confidential — do not share with students.\n— ${schoolName}`

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
      results.push({ name: teacher.full_name, sent: res.ok })
    } catch {
      results.push({ name: teacher.full_name, sent: false })
    }
  }

  const sent = results.filter(r => r.sent).length
  return NextResponse.json({ success: true, sent, total: results.length, results })
}

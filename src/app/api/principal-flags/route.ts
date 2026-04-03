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

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allowed = ['principal', 'guidance_counselling']
  if (!allowed.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // optional filter

  const sb = getClient()
  let query = sb
    .from('principal_flags')
    .select(`
      *,
      students!inner(id, full_name, admission_number)
    `)
    .eq('school_id', auth.schoolId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to load flags' }, { status: 500 })
  return NextResponse.json({ flags: data ?? [] })
}

const FlagSchema = z.object({
  studentId:    z.string().uuid(),
  flagReason:   z.string().min(1).max(1000),
  urgency:      z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  welfareLogId: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Only the principal can create flags' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = FlagSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { studentId, flagReason, urgency, welfareLogId } = parsed.data
  const sb = getClient()

  // Verify student
  const { data: student } = await sb
    .from('students')
    .select('id, full_name')
    .eq('id', studentId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Insert flag
  const { data: flag, error: flagErr } = await sb
    .from('principal_flags')
    .insert({
      school_id:     auth.schoolId,
      student_id:    studentId,
      flagged_by:    auth.userId,
      flag_reason:   flagReason,
      urgency,
      welfare_log_id: welfareLogId ?? null,
    })
    .select('id')
    .single()

  if (flagErr || !flag) {
    return NextResponse.json({ error: 'Failed to create flag' }, { status: 500 })
  }

  // Find counsellor's phone to send WhatsApp alert
  const { data: counsellor } = await sb
    .from('staff_records')
    .select('full_name, phone')
    .eq('school_id', auth.schoolId)
    .eq('sub_role', 'guidance_counselling')
    .eq('is_active', true)
    .limit(1)
    .single()

  const waToken = process.env.WHATSAPP_API_TOKEN
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (counsellor?.phone && waToken && waPhoneId) {
    const urgencyLabel = urgency.charAt(0).toUpperCase() + urgency.slice(1)
    const phone = counsellor.phone.replace(/\D/g, '')
    const msg = `⚠️ ${urgencyLabel} — Principal has flagged ${student.full_name} for counselling attention.\n\nReason: ${flagReason}\n\nPlease log into Sychar Copilot to view details and schedule a meeting.\n— Nkoroi Mixed Day Secondary School`

    fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
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
    }).catch(e => console.error('[principal-flags/whatsapp]', e))
  }

  return NextResponse.json({ success: true, flagId: flag.id })
}

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

const PatchSchema = z.object({
  status:              z.enum(['open','acknowledged','meeting_scheduled','resolved']).optional(),
  counsellorResponse:  z.string().max(2000).optional(),
  meetingDate:         z.string().datetime().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allowed = ['principal', 'guidance_counselling']
  if (!allowed.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const sb = getClient()
  const updates: Record<string, unknown> = {}

  if (parsed.data.status) {
    updates.status = parsed.data.status
    if (parsed.data.status === 'resolved') {
      updates.resolved_at = new Date().toISOString()
    }
  }
  if (parsed.data.counsellorResponse !== undefined) {
    updates.counsellor_response = parsed.data.counsellorResponse
  }
  if (parsed.data.meetingDate) {
    updates.meeting_date = parsed.data.meetingDate
  }

  const { error } = await sb
    .from('principal_flags')
    .update(updates)
    .eq('id', id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Failed to update flag' }, { status: 500 })

  // Notify principal when counsellor acknowledges/resolves
  if (auth.subRole === 'guidance_counselling' && parsed.data.status) {
    // Fire-and-forget WhatsApp to principal
    const { data: flag } = await sb
      .from('principal_flags')
      .select('student_id, students!inner(full_name)')
      .eq('id', id)
      .single() as { data: { student_id: string; students: { full_name: string } } | null }

    if (flag) {
      const { data: principal } = await sb
        .from('staff_records')
        .select('phone')
        .eq('school_id', auth.schoolId)
        .eq('sub_role', 'principal')
        .limit(1)
        .single()

      const waToken = process.env.WHATSAPP_API_TOKEN
      const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

      if (principal?.phone && waToken && waPhoneId) {
        const actionLabel = parsed.data.status === 'acknowledged' ? 'acknowledged the flag for'
          : parsed.data.status === 'meeting_scheduled' ? 'scheduled a meeting with'
          : 'resolved the flag for'
        const phone = principal.phone.replace(/\D/g, '')
        const msg = `Sychar Copilot — Counsellor has ${actionLabel} ${flag.students.full_name}.\n${parsed.data.counsellorResponse ? `Response: ${parsed.data.counsellorResponse}` : ''}`

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
        }).catch(e => console.error('[principal-flags/notify]', e))
      }
    }
  }

  return NextResponse.json({ success: true })
}

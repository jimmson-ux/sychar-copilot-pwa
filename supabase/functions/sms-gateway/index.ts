import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleOptions } from '../_shared/cors.ts'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const NKOROI_SCHOOL_ID = '68bd8d34-f2f0-4297-bd18-093328824d84'

serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const AT_SECRET = Deno.env.get('AT_WEBHOOK_SECRET')

  if (AT_SECRET) {
    const signature = req.headers.get('x-africastalking-signature')
    const body = await req.text()

    const expected = createHmac('sha256', AT_SECRET)
      .update(body)
      .digest('hex')

    if (signature !== expected) {
      console.warn('[sms-gateway] Invalid signature')
      return new Response('Forbidden', { status: 403 })
    }

    const params = new URLSearchParams(body)
    const phone = params.get('from') || ''
    const text = (params.get('text') || '').trim().toUpperCase()
    return await processClockIn(phone, text)
  }

  // Dev path — no signature verification
  const formData = await req.formData()
  const phone = formData.get('from')?.toString() || ''
  const text = (formData.get('text')?.toString() || '').trim().toUpperCase()
  return await processClockIn(phone, text)
})

async function processClockIn(phone: string, text: string): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (!['IN', 'OUT', 'STATUS'].includes(text)) {
    return sendSmsReply('Sychar Copilot: Send "IN" to clock in, "OUT" to clock out, or "STATUS" to check your status.')
  }

  const normalizedPhone = phone.replace(/\D/g, '')
    .replace(/^254/, '+254')
    .replace(/^0/, '+254')

  const { data: staff } = await supabase
    .from('staff_records')
    .select('id, full_name, school_id, is_active')
    .eq('phone', normalizedPhone)
    .eq('school_id', NKOROI_SCHOOL_ID)
    .single()

  if (!staff || !staff.is_active) {
    return sendSmsReply('Sychar Copilot: Your number is not registered. Contact school admin.')
  }

  if (text === 'STATUS') {
    const { data: lastClock } = await supabase
      .from('staff_attendance')
      .select('status, created_at')
      .eq('staff_id', staff.id)
      .eq('date', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const status = lastClock
      ? `Last recorded: ${lastClock.status} at ${new Date(lastClock.created_at).toLocaleTimeString('en-KE')}`
      : 'No attendance recorded today.'
    return sendSmsReply(`Sychar Copilot: ${staff.full_name} — ${status}`)
  }

  const token = crypto.randomUUID()
  const APP_URL = Deno.env.get('APP_URL') || 'https://sychar-copilot-pwa.vercel.app'

  await supabase.from('pending_clock_ins').insert([{
    token,
    staff_id: staff.id,
    school_id: staff.school_id,
    phone: normalizedPhone,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }])

  const action = text === 'IN' ? 'clock-in' : 'clock-out'
  const reply = `Sychar: ${staff.full_name}, confirm your ${action} location (valid 10 min): ${APP_URL}/loc-verify?t=${token}`
  return sendSmsReply(reply)
}

function sendSmsReply(message: string): Response {
  return new Response(message, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

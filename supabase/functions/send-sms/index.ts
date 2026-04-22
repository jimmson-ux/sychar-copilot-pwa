import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const auth = await verifyRequest(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const { phone, message, recipientName, messageType } = await req.json()

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone and message required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    if (message.length > 160) {
      return new Response(JSON.stringify({ error: 'Message exceeds 160 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const AT_API_KEY   = Deno.env.get('AT_API_KEY')
    const AT_USERNAME  = Deno.env.get('AT_USERNAME')
    const AT_SENDER_ID = Deno.env.get('AT_SENDER_ID') || 'NKOROI'

    if (!AT_API_KEY || !AT_USERNAME) throw new Error("Africa's Talking not configured")

    const formData = new URLSearchParams({
      username: AT_USERNAME,
      to:       phone,
      message,
      from:     AT_SENDER_ID,
    })

    const atRes = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: formData,
    })

    const atData  = await atRes.json()
    const status  = atData.SMSMessageData?.Recipients?.[0]?.status || 'Unknown'
    const cost    = atData.SMSMessageData?.Recipients?.[0]?.cost || '0'
    const msgId   = atData.SMSMessageData?.Recipients?.[0]?.messageId

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const costKes = parseFloat((cost as string).replace('KES ', '')) || 0

    await Promise.all([
      supabase.from('sms_log').insert([{
        school_id:      auth.schoolId,
        recipient_phone: phone,
        recipient_name:  recipientName || '',
        message,
        message_type:   messageType || 'general',
        status:         status === 'Success' ? 'sent' : 'failed',
        at_message_id:  msgId,
        cost_kes:       costKes,
        sent_by:        auth.userId,
        created_at:     new Date().toISOString(),
      }]),
      supabase.from('sms_usage').upsert([{
        school_id: auth.schoolId,
        month:     new Date().toISOString().slice(0, 7),
        count:     1,
        cost_kes:  costKes,
      }], { onConflict: 'school_id,month', ignoreDuplicates: false }),
    ])

    return new Response(JSON.stringify({ success: status === 'Success', status, cost }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (error) {
    console.error('[send-sms]', error)
    return new Response(JSON.stringify({ error: 'SMS delivery failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})

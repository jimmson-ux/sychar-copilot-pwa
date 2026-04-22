import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { verifyToken } from '../_shared/auth.ts'

serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const origin = req.headers.get('origin')

  try {
    const auth = await verifyToken(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const { parentId, studentId, messageBody, messageType, metadata } = await req.json()

    if (!parentId || !messageBody) {
      return new Response(JSON.stringify({ error: 'parentId and messageBody required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await supabase.from('parent_messages').insert([{
      parent_id: parentId,
      school_id: auth.schoolId,
      student_id: studentId || null,
      message_body: messageBody,
      sender_type: 'system_bot',
      message_type: messageType || 'text',
      metadata: metadata || {},
    }])

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (err) {
    console.error('[notify-parent]', err)
    return new Response(JSON.stringify({ error: 'Notification failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})

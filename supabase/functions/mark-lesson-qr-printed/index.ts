import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const origin = req.headers.get('origin')
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })

  try {
    const auth = await verifyRequest(req)
    if (!auth) return json({ error: 'Unauthorized' }, 401)

    const { token_id } = await req.json()
    if (!token_id) return json({ error: 'token_id required' }, 400)

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await svc
      .from('class_qr_tokens')
      .update({ printed_at: new Date().toISOString() })
      .eq('id', token_id)
      .eq('school_id', auth.schoolId)
      .is('printed_at', null)  // only mark once

    if (error) {
      console.error('[mark-lesson-qr-printed]', error)
      return json({ error: 'Mark printed failed' }, 500)
    }

    return json({ ok: true })
  } catch (err) {
    console.error('[mark-lesson-qr-printed]', err)
    return json({ error: 'Mark printed failed' }, 500)
  }
})

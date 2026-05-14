import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

const ISSUER_ROLES = new Set([
  'deputy_principal', 'deputy_principal_admin', 'deputy_principal_academic',
  'dean_of_studies', 'deputy_dean_of_studies', 'dean_of_students',
  'principal', 'super_admin',
])

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
    if (!ISSUER_ROLES.has(auth.role)) return json({ error: 'Insufficient role to revoke QR' }, 403)

    const { token_id, reason } = await req.json()
    if (!token_id) return json({ error: 'token_id required' }, 400)

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: staff } = await svc
      .from('staff_records')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!staff) return json({ error: 'Staff record not found' }, 403)

    const { error } = await svc
      .from('class_qr_tokens')
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: staff.id,
      })
      .eq('id', token_id)
      .eq('school_id', auth.schoolId)
      .eq('is_active', true)

    if (error) {
      console.error('[revoke-lesson-qr]', error)
      return json({ error: 'Revoke failed' }, 500)
    }

    // Log reason to notes in teacher_attendance_scans if any scan exists
    if (reason) {
      await svc
        .from('teacher_attendance_scans')
        .update({ notes: `QR revoked: ${reason}` })
        .eq('qr_token_id', token_id)
        .eq('status', 'present')
    }

    return json({ ok: true })
  } catch (err) {
    console.error('[revoke-lesson-qr]', err)
    return json({ error: 'Revoke failed' }, 500)
  }
})

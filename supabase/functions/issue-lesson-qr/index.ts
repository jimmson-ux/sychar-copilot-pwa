import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

const ISSUER_ROLES = new Set([
  'deputy_principal', 'deputy_principal_admin', 'deputy_principal_academic',
  'dean_of_studies', 'deputy_dean_of_studies', 'dean_of_students',
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
    if (!ISSUER_ROLES.has(auth.role)) return json({ error: 'Only deputies and deans can issue lesson QR codes' }, 403)

    const { timetable_entry_id } = await req.json()
    if (!timetable_entry_id) return json({ error: 'timetable_entry_id required' }, 400)

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch the timetable period
    const { data: period, error: pErr } = await svc
      .from('timetable_periods')
      .select('id, school_id, class_id, class_name, subject, teacher_id, teacher_name, start_time, end_time, period_number')
      .eq('id', timetable_entry_id)
      .eq('school_id', auth.schoolId)
      .single()

    if (pErr || !period) return json({ error: 'Timetable period not found' }, 404)

    // Fetch issuing staff record
    const { data: staff } = await svc
      .from('staff_records')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!staff) return json({ error: 'Staff record not found' }, 403)

    // Check for existing active QR (exclusivity constraint)
    const { data: existing } = await svc
      .from('class_qr_tokens')
      .select('id, generated_by, generator_role, generated_at, last_scanned_at, printed_at')
      .eq('school_id', auth.schoolId)
      .eq('class_id', period.class_id)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      return json({
        already_issued: true,
        issued_by_staff_id: existing.generated_by,
        issued_at: existing.generated_at,
      })
    }

    // Compute next generation_seq
    const { data: lastToken } = await svc
      .from('class_qr_tokens')
      .select('generation_seq')
      .eq('school_id', auth.schoolId)
      .eq('class_id', period.class_id)
      .order('generation_seq', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSeq = (lastToken?.generation_seq ?? 0) + 1

    // Build HMAC-SHA256 token hash using Web Crypto (Deno built-in)
    const secret = Deno.env.get('SYCHAR_QR_SECRET') ?? 'sychar-dev-secret'
    const message = `${auth.schoolId}:${period.class_id}:${nextSeq}`
    const keyData = new TextEncoder().encode(secret)
    const msgData = new TextEncoder().encode(message)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
    const tokenHash = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const APP_URL = Deno.env.get('APP_URL') ?? 'https://nkoroi-school-management-6d13.vercel.app'

    const qrPayload = JSON.stringify({
      v: 1,
      school_id: auth.schoolId,
      class_id: period.class_id,
      seq: nextSeq,
      hash: tokenHash,
      scan_url: `${APP_URL}/lesson-attend`,
    })

    // Deactivate any old tokens for this class (shouldn't exist due to UNIQUE constraint, but safety)
    await svc
      .from('class_qr_tokens')
      .update({ is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: staff.id })
      .eq('school_id', auth.schoolId)
      .eq('class_id', period.class_id)
      .eq('is_active', true)

    // Insert new token — uses ON CONFLICT DO UPDATE via upsert on school_id,class_id
    const { data: token, error: tErr } = await svc
      .from('class_qr_tokens')
      .insert({
        school_id: auth.schoolId,
        class_id: period.class_id,
        class_name: period.class_name,
        token_hash: tokenHash,
        generation_seq: nextSeq,
        qr_payload: qrPayload,
        generated_by: staff.id,
        generator_role: auth.role,
        is_active: true,
        generated_at: new Date().toISOString(),
        scan_count: 0,
      })
      .select('id, qr_payload, generated_at')
      .single()

    if (tErr || !token) {
      console.error('[issue-lesson-qr] insert error', tErr)
      return json({ error: 'Failed to issue QR token' }, 500)
    }

    return json({
      already_issued: false,
      token: {
        id: token.id,
        qr_payload: token.qr_payload,
        scheduled_start: period.start_time,
        scheduled_end: period.end_time,
      },
    })
  } catch (err) {
    console.error('[issue-lesson-qr]', err)
    return json({ error: 'QR issue failed' }, 500)
  }
})

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { verifyToken } from '../_shared/auth.ts'
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts'

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

    if (!['admin', 'staff'].includes(auth.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const body = await req.json()
    const { classId, className, streamName, purpose, roomName } = body

    const secret = new TextEncoder().encode(Deno.env.get('SYCHAR_QR_SECRET'))
    const APP_URL = Deno.env.get('APP_URL') || 'https://nkoroi-school-management-6d13.vercel.app'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Teacher check-in room QR (static, no expiry) ──────────────────────────
    if (purpose === 'teacher_checkin') {
      if (!roomName) {
        return new Response(JSON.stringify({ error: 'roomName required for teacher_checkin purpose' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        })
      }

      const payload = {
        school_id: auth.schoolId,
        room_name: roomName,
        purpose:   'teacher_checkin',
        is_static: true,
      }

      const jwt = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .sign(secret)

      const qrUrl = `${APP_URL}/teacher/checkin?token=${jwt}`

      await supabase.from('room_qr_codes').upsert([{
        school_id:  auth.schoolId,
        room_name:  roomName,
        qr_token:   jwt,
        qr_url:     qrUrl,
        is_active:  true,
        created_by: auth.userId ?? null,
        created_at: new Date().toISOString(),
      }], { onConflict: 'school_id,room_name' })

      return new Response(JSON.stringify({ success: true, token: jwt, qr_url: qrUrl }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    // ── Student daily attendance QR (existing behaviour) ──────────────────────
    const payload = {
      school_id:   auth.schoolId,
      class_id:    classId,
      class_name:  className,
      stream_name: streamName,
      purpose:     purpose || 'daily_attendance',
      is_static:   true,
    }

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(secret)

    const qrUrl = `${APP_URL}/record?token=${jwt}`

    await supabase.from('classroom_qr_codes').upsert([{
      school_id:   auth.schoolId,
      class_id:    classId,
      class_name:  className,
      stream_name: streamName,
      qr_token:    jwt,
      qr_url:      qrUrl,
      is_active:   true,
      created_at:  new Date().toISOString(),
    }], { onConflict: 'class_id' })

    return new Response(JSON.stringify({ success: true, token: jwt, qr_url: qrUrl }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (err) {
    console.error('[generate-qr-token]', err)
    return new Response(JSON.stringify({ error: 'QR generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})

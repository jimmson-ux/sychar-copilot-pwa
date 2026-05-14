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

    const { qr_payload } = await req.json()
    if (!qr_payload) return json({ error: 'qr_payload required' }, 400)

    // Parse and validate payload structure
    let parsed: { v: number; school_id: string; class_id: string; seq: number; hash: string }
    try {
      parsed = JSON.parse(qr_payload)
    } catch {
      return json({ error: 'Invalid QR payload' }, 400)
    }

    if (parsed.school_id !== auth.schoolId) {
      return json({ error: 'QR code belongs to a different school' }, 403)
    }

    // Recompute HMAC to verify tamper-proof hash
    const secret = Deno.env.get('SYCHAR_QR_SECRET') ?? 'sychar-dev-secret'
    const message = `${parsed.school_id}:${parsed.class_id}:${parsed.seq}`
    const keyData = new TextEncoder().encode(secret)
    const msgData = new TextEncoder().encode(message)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
    const expectedHash = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    if (expectedHash !== parsed.hash) {
      return json({ error: 'QR code signature invalid — possible tampering' }, 403)
    }

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch active QR token for this class
    const { data: token } = await svc
      .from('class_qr_tokens')
      .select('id, generation_seq, scan_count')
      .eq('school_id', auth.schoolId)
      .eq('class_id', parsed.class_id)
      .eq('is_active', true)
      .eq('generation_seq', parsed.seq)
      .maybeSingle()

    if (!token) {
      return json({ error: 'QR code is no longer active or has been revoked. Ask the issuer for a new code.' }, 403)
    }

    // Fetch scanning teacher's staff record
    const { data: staff } = await svc
      .from('staff_records')
      .select('id, full_name, sub_role')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!staff) return json({ error: 'Staff record not found' }, 403)

    // Verify teacher is assigned to THIS class right now via RPC
    const { data: period } = await svc
      .rpc('get_active_period_for_class', {
        p_school_id: auth.schoolId,
        p_class_id: parsed.class_id,
      })
      .maybeSingle()

    if (!period) {
      return json({
        error: 'No active lesson for this class right now. Check your timetable.',
      }, 400)
    }

    // Confirm the scanning teacher is the assigned teacher
    if (period.teacher_id && period.teacher_id !== staff.id) {
      return json({
        error: 'You are not the assigned teacher for this class this period.',
      }, 403)
    }

    const nowEAT = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const nowTime = nowEAT.toTimeString().slice(0, 8)
    const lateMinutes = computeLateMinutes(String(period.start_time), nowTime)

    // Check for duplicate scan
    const scanDate = nowEAT.toISOString().slice(0, 10)
    const { data: dupScan } = await svc
      .from('teacher_attendance_scans')
      .select('id, status, scanned_at')
      .eq('teacher_id', staff.id)
      .eq('timetable_period_id', period.period_id)
      .eq('scan_date', scanDate)
      .maybeSingle()

    if (dupScan) {
      return json({ ok: true, already_scanned: true, status: dupScan.status, scanned_at: dupScan.scanned_at })
    }

    const attendanceStatus = lateMinutes > 10 ? 'late' : 'present'

    // Insert attendance scan
    const { data: scan, error: scanErr } = await svc
      .from('teacher_attendance_scans')
      .insert({
        school_id: auth.schoolId,
        class_id: parsed.class_id,
        class_name: token ? parsed.class_id : parsed.class_id,
        subject: period.subject,
        teacher_id: staff.id,
        teacher_name: staff.full_name,
        timetable_period_id: period.period_id,
        qr_token_id: token.id,
        scan_date: scanDate,
        expected_start: period.start_time,
        expected_end: period.end_time,
        scanned_at: new Date().toISOString(),
        late_minutes: lateMinutes,
        status: attendanceStatus,
        device_info: req.headers.get('user-agent') ?? null,
        ip_address: req.headers.get('x-forwarded-for') ?? null,
      })
      .select('id')
      .single()

    if (scanErr || !scan) {
      console.error('[scan-lesson-qr] insert scan error', scanErr)
      return json({ error: 'Failed to record attendance' }, 500)
    }

    // Update QR token scan counter
    await svc
      .from('class_qr_tokens')
      .update({
        scan_count: (token.scan_count ?? 0) + 1,
        last_scanned_at: new Date().toISOString(),
      })
      .eq('id', token.id)

    // Fetch today's scans for this teacher for Groq anomaly check
    const { data: todayScans } = await svc
      .from('teacher_attendance_scans')
      .select('class_id, subject, scanned_at, status, late_minutes')
      .eq('teacher_id', staff.id)
      .eq('scan_date', scanDate)

    const anomalyFlag = await detectAnomalyWithGroq({
      teacherName: staff.full_name ?? 'Teacher',
      newScan: { class_id: parsed.class_id, subject: period.subject, late_minutes: lateMinutes },
      todayScans: todayScans ?? [],
    })

    if (anomalyFlag.suspicious) {
      await svc.from('teacher_attendance_scans')
        .update({ notes: `AI flag: ${anomalyFlag.reason}` })
        .eq('id', scan.id)
    }

    return json({
      ok: true,
      already_scanned: false,
      scan_id: scan.id,
      status: attendanceStatus,
      late_minutes: lateMinutes,
      subject: period.subject,
      expected_start: period.start_time,
      expected_end: period.end_time,
      ai_flag: anomalyFlag.suspicious ? anomalyFlag.reason : null,
    })
  } catch (err) {
    console.error('[scan-lesson-qr]', err)
    return json({ error: 'Scan processing failed' }, 500)
  }
})

function computeLateMinutes(startTime: string, nowTime: string): number {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const diff = toMinutes(nowTime) - toMinutes(startTime)
  return Math.max(0, diff)
}

async function detectAnomalyWithGroq(ctx: {
  teacherName: string
  newScan: { class_id: string; subject: string | null; late_minutes: number }
  todayScans: Array<{ class_id: string; subject: string | null; scanned_at: string; status: string; late_minutes: number | null }>
}): Promise<{ suspicious: boolean; reason: string }> {
  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) return { suspicious: false, reason: '' }

  // Quick heuristics before calling AI (save API cost)
  if (ctx.todayScans.length < 2) return { suspicious: false, reason: '' }

  const classCounts = ctx.todayScans.reduce((acc, s) => {
    acc[s.class_id] = (acc[s.class_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const hasDuplicate = Object.values(classCounts).some((c) => c > 1)

  const systemPrompt = `You are an attendance anomaly detector for a Kenyan secondary school.
Given a teacher's scans for today, identify if the new scan is suspicious.
Reply with JSON only: {"suspicious": boolean, "reason": "short reason or empty string"}.
Suspicious patterns: same class scanned twice, scanning outside lesson time, scanning more than 8 lessons per day.`

  const userMsg = `Teacher: ${ctx.teacherName}
Today's previous scans (${ctx.todayScans.length}): ${JSON.stringify(ctx.todayScans.map(s => ({ class_id: s.class_id, subject: s.subject, late_minutes: s.late_minutes })))}
New scan: ${JSON.stringify(ctx.newScan)}
Duplicate class detected by heuristic: ${hasDuplicate}`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
      }),
    })

    if (!res.ok) return { suspicious: false, reason: '' }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(content)
    return {
      suspicious: !!parsed.suspicious,
      reason: parsed.reason ?? '',
    }
  } catch {
    return { suspicious: false, reason: '' }
  }
}

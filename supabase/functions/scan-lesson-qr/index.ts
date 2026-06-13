/**
 * scan-lesson-qr
 *
 * Teacher scans the class QR code to record lesson attendance.
 * Integrates Genesis Protocol geofence: if the classroom is locked,
 * the teacher's GPS must be within 15 m of the master location.
 *
 * GPS logging feeds the self-healing centroid refinement trigger.
 */

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

    const {
      qr_payload,
      device_latitude,
      device_longitude,
      accuracy_radius,
      device_fingerprint,
      device_label,
    } = await req.json() as {
      qr_payload: string
      device_latitude?: number
      device_longitude?: number
      accuracy_radius?: number
      device_fingerprint?: string
      device_label?: string
    }

    if (!qr_payload) return json({ error: 'qr_payload required' }, 400)

    // ── Parse + validate payload ─────────────────────────────────────────────
    let parsed: { v: number; school_id: string; class_id: string; seq: number; hash: string }
    try { parsed = JSON.parse(qr_payload) } catch {
      return json({ error: 'Invalid QR payload — not a recognised Sychar QR code' }, 400)
    }

    if (parsed.school_id !== auth.schoolId) {
      return json({ error: 'QR code belongs to a different school' }, 403)
    }

    // ── HMAC verification ────────────────────────────────────────────────────
    const secret = Deno.env.get('SYCHAR_QR_SECRET') ?? 'sychar-dev-secret'
    const message = `${parsed.school_id}:${parsed.class_id}:${parsed.seq}`
    const cryptoKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
    const expectedHash = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0')).join('')

    if (expectedHash !== parsed.hash) {
      return json({ error: 'QR code signature invalid — possible tampering detected' }, 403)
    }

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Fetch active QR token ────────────────────────────────────────────────
    const { data: token } = await svc
      .from('class_qr_tokens')
      .select('id, generation_seq, scan_count')
      .eq('school_id', auth.schoolId)
      .eq('class_id', parsed.class_id)
      .eq('is_active', true)
      .eq('generation_seq', parsed.seq)
      .maybeSingle()

    if (!token) {
      return json({
        error: 'This QR code has been revoked or expired. Ask the deputy/dean to issue a new one.',
      }, 403)
    }

    // ── Fetch scanning teacher's staff record ────────────────────────────────
    const { data: staff } = await svc
      .from('staff_records')
      .select('id, full_name, sub_role')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!staff) return json({ error: 'Staff record not found for your user account' }, 403)

    // ── Verify active timetable period ───────────────────────────────────────
    const { data: period } = await svc
      .rpc('get_active_period_for_class', {
        p_school_id: auth.schoolId,
        p_class_id: parsed.class_id,
      })
      .maybeSingle()

    if (!period) {
      return json({
        error: 'No active lesson scheduled for this class right now. Check your timetable.',
      }, 400)
    }

    // ── Teacher assignment check ─────────────────────────────────────────────
    if (period.teacher_id && period.teacher_id !== staff.id) {
      return json({
        error: 'You are not the assigned teacher for this class this period.',
      }, 403)
    }

    // ── Strict geofence mode (per-school flag) ───────────────────────────────
    // When tenant_configs.features.strict_geofence = true, geofencing is
    // MANDATORY: GPS must be present, the room must be Genesis-locked, the
    // reading must be accurate, and the teacher must be inside the radius.
    // This is what makes a photographed/reprinted wall QR useless elsewhere.
    const { data: cfg } = await svc
      .from('tenant_configs')
      .select('features')
      .eq('school_id', auth.schoolId)
      .maybeSingle()
    const strictGeofence = Boolean(
      (cfg?.features as Record<string, boolean> | null)?.strict_geofence,
    )
    const strictDevice = Boolean(
      (cfg?.features as Record<string, boolean> | null)?.strict_device,
    )

    // ── Device registration (anti-proxy) ─────────────────────────────────────
    // Bind the teacher to approved device(s). A new device is recorded PENDING; if
    // strict_device is on for the school, an unapproved device is rejected.
    let deviceApproved = true
    if (device_fingerprint) {
      const { data: appr } = await svc.rpc('touch_teacher_device', {
        p_teacher_id: staff.id, p_school_id: auth.schoolId,
        p_fingerprint: device_fingerprint, p_label: device_label ?? null,
      })
      deviceApproved = Boolean(appr)
      if (strictDevice && !deviceApproved) {
        return json({
          error: 'Unrecognised device. This phone is not yet approved for lesson scanning — ask the Deputy/Dean to approve it.',
          deviceStatus: 'pending',
        }, 403)
      }
    } else if (strictDevice) {
      return json({ error: 'Device identification required for lesson scanning.' }, 400)
    }

    if (strictGeofence && (device_latitude == null || device_longitude == null)) {
      return json({
        error: 'Location required. Turn on GPS/location for this device and scan again from inside the classroom.',
        geo_required: true,
      }, 400)
    }

    // ── GPS Geofence Check (Genesis Protocol integration) ────────────────────
    let geoVerified = false
    let geoMismatch = false
    let distanceMeters: number | null = null
    let geoNote: string | null = null
    let classroomId: string | null = null

    if (device_latitude != null && device_longitude != null) {
      // Look up the classroom for this period (by room name)
      // Try to match the classroom for this period's venue.
      // 1. Exact match on venue/room field from the period RPC.
      // 2. Fallback: any locked classroom for this school.
      const venue = (period as any).venue ?? (period as any).room ?? null
      let classroomQuery = svc
        .from('classrooms')
        .select('id, room_name, is_geofence_locked, geo_latitude, geo_longitude, geofence_radius_m, genesis_accuracy_m')
        .eq('school_id', auth.schoolId)
        .eq('is_geofence_locked', true)

      if (venue) {
        classroomQuery = classroomQuery.ilike('room_name', venue.trim())
      }

      const { data: classroom } = await classroomQuery.maybeSingle()

      // Strict mode: the room MUST be Genesis-locked before lessons can be scanned here.
      if (strictGeofence && (!classroom?.is_geofence_locked || !classroom.geo_latitude || !classroom.geo_longitude)) {
        return json({
          error: 'This classroom has no active geofence lock. Ask an authorised delegate to run Genesis for this room before lessons can be scanned here.',
          geo_required: true,
        }, 400)
      }

      if (classroom?.is_geofence_locked && classroom.geo_latitude && classroom.geo_longitude) {
        classroomId = classroom.id
        distanceMeters = haversineMeters(
          device_latitude, device_longitude,
          Number(classroom.geo_latitude), Number(classroom.geo_longitude),
        )

        // Use the per-room geofence radius set during genesis, default 20 m.
        const geofenceRadius = Number(classroom.geofence_radius_m ?? 20)

        // Teacher's phone GPS must be reasonable for indoor use.
        const gpsAccurate = !accuracy_radius || accuracy_radius < 25

        if (!gpsAccurate) {
          geoNote = `GPS accuracy too low (±${Math.round(accuracy_radius!)} m) for geofence verification.`
          // In strict mode an inaccurate fix cannot be trusted — reject.
          if (strictGeofence) {
            return json({
              error: `GPS accuracy too low (±${Math.round(accuracy_radius!)} m). Move near a window/outdoors for a moment, then scan again inside ${classroom.room_name}.`,
              geo_required: true,
            }, 400)
          }
        } else if (distanceMeters <= geofenceRadius) {
          geoVerified = true
        } else {
          geoMismatch = true
          return json({
            error: `You appear to be ${Math.round(distanceMeters)} m from ${classroom.room_name} ` +
                   `(geofence: ${Math.round(geofenceRadius)} m). Walk to the classroom and scan again.`,
            geo_mismatch: true,
            distance_meters: Math.round(distanceMeters),
          }, 400)
        }
      }
    }

    // ── Duplicate scan check ─────────────────────────────────────────────────
    const nowEAT = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const scanDate = nowEAT.toISOString().slice(0, 10)

    const { data: dupScan } = await svc
      .from('teacher_attendance_scans')
      .select('id, status, scanned_at')
      .eq('teacher_id', staff.id)
      .eq('timetable_period_id', period.period_id)
      .eq('scan_date', scanDate)
      .maybeSingle()

    if (dupScan) {
      return json({
        ok: true,
        already_scanned: true,
        status: dupScan.status,
        scanned_at: dupScan.scanned_at,
        geo_verified: geoVerified,
      })
    }

    // ── Calculate lateness ───────────────────────────────────────────────────
    const nowTime = nowEAT.toTimeString().slice(0, 8)
    const lateMinutes = computeLateMinutes(String(period.start_time), nowTime)
    const attendanceStatus = lateMinutes > 10 ? 'late' : 'present'

    // ── Insert attendance scan ───────────────────────────────────────────────
    const { data: scan, error: scanErr } = await svc
      .from('teacher_attendance_scans')
      .insert({
        school_id: auth.schoolId,
        class_id: parsed.class_id,
        class_name: parsed.class_id,
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
        device_info: device_label ?? req.headers.get('user-agent') ?? null,
        ip_address: req.headers.get('x-forwarded-for') ?? null,
        notes: [geoNote, deviceApproved ? null : 'New/unapproved device — pending leadership approval'].filter(Boolean).join(' · ') || null,
      })
      .select('id')
      .single()

    if (scanErr || !scan) {
      console.error('[scan-lesson-qr] insert scan error', scanErr)
      return json({ error: 'Failed to record attendance' }, 500)
    }

    // ── Update QR token scan counter ─────────────────────────────────────────
    await svc
      .from('class_qr_tokens')
      .update({
        scan_count: (token.scan_count ?? 0) + 1,
        last_scanned_at: new Date().toISOString(),
      })
      .eq('id', token.id)

    // ── Log GPS for centroid drift refinement ────────────────────────────────
    // Log verified scans AND accurate readings within 2× the geofence radius
    // so the self-heal trigger has more high-quality data to refine the centroid.
    const shouldLog =
      classroomId &&
      device_latitude != null &&
      device_longitude != null &&
      accuracy_radius != null &&
      accuracy_radius <= 20 &&                   // only log when GPS is meaningful
      distanceMeters != null &&
      distanceMeters <= 60                        // within 3× worst-case geofence
    if (shouldLog) {
      await svc.from('classroom_gps_logs').insert({
        classroom_id:         classroomId,
        school_id:            auth.schoolId,
        teacher_id:           staff.id,
        scan_latitude:        device_latitude,
        scan_longitude:       device_longitude,
        accuracy_meters:      accuracy_radius,
        distance_to_center_m: distanceMeters != null ? Math.round(distanceMeters * 100) / 100 : null,
      })
    }

    // ── Groq AI anomaly detection ────────────────────────────────────────────
    const { data: todayScans } = await svc
      .from('teacher_attendance_scans')
      .select('class_id, subject, scanned_at, status, late_minutes')
      .eq('teacher_id', staff.id)
      .eq('scan_date', scanDate)

    const anomalyFlag = await detectAnomalyWithGroq({
      teacherName: staff.full_name ?? 'Teacher',
      newScan: { class_id: parsed.class_id, subject: period.subject, late_minutes: lateMinutes, geo_verified: geoVerified },
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
      geo_verified: geoVerified,
      geo_note: geoNote,
      device_status: device_fingerprint ? (deviceApproved ? 'approved' : 'pending') : 'unknown',
      distance_meters: distanceMeters ? Math.round(distanceMeters) : null,
      ai_flag: anomalyFlag.suspicious ? anomalyFlag.reason : null,
    })
  } catch (err) {
    console.error('[scan-lesson-qr]', err)
    return json({ error: 'Scan processing failed' }, 500)
  }
})

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function computeLateMinutes(startTime: string, nowTime: string): number {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  return Math.max(0, toMin(nowTime) - toMin(startTime))
}

async function detectAnomalyWithGroq(ctx: {
  teacherName: string
  newScan: { class_id: string; subject: string | null; late_minutes: number; geo_verified: boolean }
  todayScans: Array<{ class_id: string; subject: string | null; scanned_at: string; status: string; late_minutes: number | null }>
}): Promise<{ suspicious: boolean; reason: string }> {
  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey || ctx.todayScans.length < 2) return { suspicious: false, reason: '' }

  const classCounts = ctx.todayScans.reduce((acc, s) => ({ ...acc, [s.class_id]: (acc[s.class_id] ?? 0) + 1 }), {} as Record<string, number>)
  const hasDuplicate = Object.values(classCounts).some((c) => c > 1)

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
          {
            role: 'system',
            content: 'You are an attendance anomaly detector for a Kenyan secondary school. Reply with JSON only: {"suspicious":boolean,"reason":"short reason or empty string"}. Flag if: same class twice, >8 lessons per day, or geo not verified with suspicious pattern.',
          },
          {
            role: 'user',
            content: `Teacher: ${ctx.teacherName}\nPrevious scans today (${ctx.todayScans.length}): ${JSON.stringify(ctx.todayScans.map(s => ({ class: s.class_id, late: s.late_minutes })))}\nNew scan: ${JSON.stringify(ctx.newScan)}\nDuplicate class heuristic: ${hasDuplicate}`,
          },
        ],
      }),
    })
    if (!res.ok) return { suspicious: false, reason: '' }
    const data = await res.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
    return { suspicious: !!parsed.suspicious, reason: parsed.reason ?? '' }
  } catch {
    return { suspicious: false, reason: '' }
  }
}

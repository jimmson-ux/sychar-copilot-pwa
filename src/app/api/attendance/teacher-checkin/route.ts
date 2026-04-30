// POST /api/attendance/teacher-checkin
// 8-step validation: JWT → school → time window → timetable slot → duplicate →
//                   geofence → GPS integrity → insert session

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { jwtVerify } from 'jose'

export const CHECKIN_ERRORS = {
  INVALID_QR:        { code: 'INVALID_QR',        message: 'QR code is invalid or corrupted',            retryable: false },
  WRONG_SCHOOL:      { code: 'WRONG_SCHOOL',       message: 'This QR code is for a different school',    retryable: false },
  WRONG_PURPOSE:     { code: 'WRONG_PURPOSE',      message: 'This QR code is not for teacher check-in',  retryable: false },
  NO_LESSON:         { code: 'NO_LESSON',          message: 'No lesson scheduled for this room right now', retryable: true },
  NOT_YOUR_LESSON:   { code: 'NOT_YOUR_LESSON',    message: 'This lesson is not on your timetable',      retryable: false },
  TIME_WINDOW:       { code: 'TIME_WINDOW',        message: 'Check-in window has closed',                retryable: false },
  ALREADY_CHECKED_IN:{ code: 'ALREADY_CHECKED_IN', message: 'You already checked in for this lesson',    retryable: false },
  GEOFENCE_FAIL:     { code: 'GEOFENCE_FAIL',      message: 'You appear to be outside school premises',  retryable: true },
  GPS_INTEGRITY:     { code: 'GPS_INTEGRITY',      message: 'Location data appears suspicious',          retryable: true },
} as const

function encoder() {
  return new TextEncoder().encode(process.env.SYCHAR_QR_SECRET ?? 'sychar-qr-fallback')
}

// Haversine distance in metres (JS-side, mirrors DB function)
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    qr_token?: string
    lat?: number
    lng?: number
    topic_covered?: string
  }

  const { qr_token, lat, lng, topic_covered } = body

  // ── Step 1: Verify JWT ─────────────────────────────────────────────────────
  if (!qr_token) {
    return NextResponse.json({ ...CHECKIN_ERRORS.INVALID_QR }, { status: 400 })
  }

  let tokenPayload: { school_id?: string; room_name?: string; purpose?: string }
  try {
    const { payload } = await jwtVerify(qr_token, encoder())
    tokenPayload = payload as typeof tokenPayload
  } catch {
    return NextResponse.json({ ...CHECKIN_ERRORS.INVALID_QR }, { status: 400 })
  }

  // ── Step 2: Verify school ─────────────────────────────────────────────────
  if (tokenPayload.school_id !== auth.schoolId) {
    return NextResponse.json({ ...CHECKIN_ERRORS.WRONG_SCHOOL }, { status: 403 })
  }

  // ── Step 3: Verify purpose ────────────────────────────────────────────────
  if (tokenPayload.purpose !== 'teacher_checkin') {
    return NextResponse.json({ ...CHECKIN_ERRORS.WRONG_PURPOSE }, { status: 400 })
  }

  const roomName = tokenPayload.room_name ?? ''
  const db = createAdminSupabaseClient()

  // Resolve staff_records.id
  const { data: staff } = await db
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!staff) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  // ── Step 4: Find timetable slot (teacher + room + current time) ───────────
  const { data: lessons } = await db.rpc('get_current_lesson_for_teacher', {
    p_staff_id:  staff.id,
    p_school_id: auth.schoolId,
  })

  const lesson = (lessons ?? []).find(
    (l: { room_name?: string }) =>
      !roomName || (l.room_name ?? '').toLowerCase() === roomName.toLowerCase()
  ) ?? lessons?.[0] ?? null

  if (!lesson) {
    // No lesson for this teacher right now at all
    return NextResponse.json({ ...CHECKIN_ERRORS.NO_LESSON }, { status: 422 })
  }

  // If room name doesn't match (and a room is set on the entry), reject
  if (lesson.room_name && roomName &&
      lesson.room_name.toLowerCase() !== roomName.toLowerCase()) {
    return NextResponse.json({ ...CHECKIN_ERRORS.NOT_YOUR_LESSON }, { status: 422 })
  }

  // ── Step 5: Duplicate check ───────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const { data: existingSession } = await db
    .from('lesson_sessions')
    .select('id, session_status')
    .eq('timetable_entry_id', lesson.entry_id)
    .eq('date', today)
    .limit(1)
    .single()

  if (existingSession?.session_status === 'checked_in') {
    return NextResponse.json({ ...CHECKIN_ERRORS.ALREADY_CHECKED_IN, session_id: existingSession.id }, { status: 409 })
  }

  // ── Step 6: Geofence check ─────────────────────────────────────────────────
  if (lat != null && lng != null) {
    const { data: tenant } = await db
      .from('tenant_configs')
      .select('school_lat, school_lng, geofence_radius_meters')
      .eq('school_id', auth.schoolId)
      .single()

    if (tenant?.school_lat && tenant?.school_lng) {
      const radius = (tenant as { geofence_radius_meters?: number }).geofence_radius_meters ?? 500
      const dist = haversineMetres(lat, lng, tenant.school_lat, tenant.school_lng)
      if (dist > radius) {
        return NextResponse.json(
          { ...CHECKIN_ERRORS.GEOFENCE_FAIL, distance_m: Math.round(dist), radius_m: radius },
          { status: 422 }
        )
      }
    }
  }

  // ── Step 7: GPS integrity — reject implausible speed from last heartbeat ──
  if (lat != null && lng != null) {
    const { data: lastBeat } = await db
      .from('lesson_heartbeats')
      .select('lat, lng, timestamp')
      .eq('teacher_id', staff.id as string)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (lastBeat?.lat && lastBeat?.lng && lastBeat?.timestamp) {
      const elapsedSec = (Date.now() - new Date(lastBeat.timestamp as string).getTime()) / 1000
      const dist = haversineMetres(lat, lng, lastBeat.lat as number, lastBeat.lng as number)
      const speedKmh = (dist / elapsedSec) * 3.6
      if (speedKmh > 150) {
        return NextResponse.json({ ...CHECKIN_ERRORS.GPS_INTEGRITY, speed_kmh: Math.round(speedKmh) }, { status: 422 })
      }
    }
  }

  // ── Step 8: Insert (or update missed→checked_in) lesson_session ───────────
  const now = new Date().toISOString()
  let sessionId: string

  if (existingSession) {
    // Was previously marked missed — upgrade to checked_in
    await db
      .from('lesson_sessions')
      .update({
        session_status: 'checked_in',
        checkin_time:   now,
        lat:            lat ?? null,
        lng:            lng ?? null,
        is_active:      true,
        check_in_confirmed: true,
        topic_covered:  topic_covered ?? null,
        qr_room_name:   roomName,
      })
      .eq('id', existingSession.id)
    sessionId = existingSession.id
  } else {
    const { data: newSession, error: insertErr } = await db
      .from('lesson_sessions')
      .insert({
        school_id:          auth.schoolId,
        teacher_id:         staff.id,
        class_name:         lesson.class_name,
        subject:            lesson.subject,
        date:               today,
        period:             lesson.period_number,
        start_time:         lesson.start_time,
        end_time:           lesson.end_time,
        timetable_entry_id: lesson.entry_id,
        qr_room_name:       roomName,
        checkin_time:       now,
        session_status:     'checked_in',
        is_active:          true,
        check_in_confirmed: true,
        lat:                lat ?? null,
        lng:                lng ?? null,
        topic_covered:      topic_covered ?? null,
      })
      .select('id')
      .single()

    if (insertErr || !newSession) {
      console.error('[teacher-checkin] insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to record check-in' }, { status: 500 })
    }
    sessionId = newSession.id
  }

  return NextResponse.json({
    ok:        true,
    session_id: sessionId,
    lesson: {
      class_name:   lesson.class_name,
      subject:      lesson.subject,
      period_number: lesson.period_number,
      start_time:   lesson.start_time,
      end_time:     lesson.end_time,
      room_name:    lesson.room_name,
    },
  })
}

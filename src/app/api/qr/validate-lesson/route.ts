// POST /api/qr/validate-lesson
// 7-step lesson check-in validation.
// Body: { qr_data: string, teacher_lat: number, teacher_lng: number,
//         phone_orientation: number, location_confidence: number }

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createHmac } from 'crypto'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getCurrentTerm(): number {
  const m = new Date().getMonth() + 1
  if (m <= 4) return 1
  if (m <= 8) return 2
  return 3
}

// Haversine distance in metres
function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R   = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dphi = ((lat2 - lat1) * Math.PI) / 180
  const dlam = ((lng2 - lng1) * Math.PI) / 180
  const a   = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Angular difference capped to [0, 180]
function angleDiff(a: number, b: number): number {
  return Math.min(Math.abs(a - b) % 360, 360 - Math.abs(a - b) % 360)
}

interface QRPayload {
  school_id:   string
  room_id:     string
  room_name:   string
  geo:         { lat: number; lng: number }
  orientation: number
  term:        number
  version:     number
  issued_at:   number
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId } = auth

  const secret = process.env.CLASSROOM_QR_SECRET
  if (!secret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const body = await req.json() as {
    qr_data:             string
    teacher_lat:         number
    teacher_lng:         number
    phone_orientation:   number
    location_confidence: number
    subject:             string
    class_name:          string
    period:              number
  }

  const failures: string[] = []

  // ── Step 1: Decode & HMAC verify ─────────────────────────────────────────
  let payload: QRPayload
  try {
    const raw    = Buffer.from(body.qr_data, 'base64').toString('utf8')
    const dotIdx = raw.lastIndexOf('.')
    if (dotIdx === -1) throw new Error('malformed')
    const payloadStr = raw.slice(0, dotIdx)
    const sig        = raw.slice(dotIdx + 1)
    const expected   = createHmac('sha256', secret).update(payloadStr).digest('hex')
    if (sig !== expected) {
      return NextResponse.json({ ok: false, failures: ['HMAC signature invalid'] }, { status: 400 })
    }
    payload = JSON.parse(payloadStr) as QRPayload
  } catch {
    return NextResponse.json({ ok: false, failures: ['QR decode failed'] }, { status: 400 })
  }

  // ── Step 2: QR not expired (max 90 days old — refreshed each term) ────────
  const ageMs = Date.now() - (payload.issued_at ?? 0)
  if (ageMs > 90 * 24 * 3600 * 1000) failures.push('QR code expired (> 90 days)')

  // ── Step 3: Term match ────────────────────────────────────────────────────
  if (payload.term !== getCurrentTerm()) failures.push(`QR term (${payload.term}) ≠ current term (${getCurrentTerm()})`)

  // ── Step 4: School match ──────────────────────────────────────────────────
  if (payload.school_id !== schoolId) failures.push('QR school does not match your school')

  // ── Step 5: Teacher geofence (25 m) via PostGIS ───────────────────────────
  if (body.teacher_lat == null || body.teacher_lng == null) {
    failures.push('Teacher location not provided')
  } else {
    const dist = distanceMetres(body.teacher_lat, body.teacher_lng, payload.geo.lat, payload.geo.lng)
    if (dist > 25) failures.push(`Outside geofence: ${Math.round(dist)} m from classroom (max 25 m)`)
  }

  // ── Step 6: Phone orientation (±15°) ─────────────────────────────────────
  if (body.phone_orientation != null) {
    const diff = angleDiff(body.phone_orientation, payload.orientation)
    if (diff > 15) failures.push(`Orientation mismatch: ${Math.round(diff)}° off (max ±15°)`)
  }

  // ── Step 7: Location confidence score ────────────────────────────────────
  if ((body.location_confidence ?? 100) < 40) {
    failures.push(`Location confidence too low: ${body.location_confidence} (min 40)`)
  }

  if (failures.length > 0) {
    return NextResponse.json({ ok: false, failures })
  }

  // ── All checks passed — create lesson session ─────────────────────────────
  const db = svc()
  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()

  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const today = new Date().toISOString().split('T')[0]
  const now   = new Date().toISOString()

  const { data: session, error } = await db
    .from('lesson_sessions')
    .insert({
      school_id:          schoolId,
      teacher_id:         staff.id,
      class_name:         body.class_name,
      subject:            body.subject,
      date:               today,
      period:             body.period ?? null,
      start_time:         now,
      lat:                body.teacher_lat,
      lng:                body.teacher_lng,
      is_active:          true,
      check_in_confirmed: true,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({
    ok:         true,
    session_id: (session as { id: string }).id,
    room_name:  payload.room_name,
    message:    `Check-in confirmed — ${payload.room_name}`,
  })
}

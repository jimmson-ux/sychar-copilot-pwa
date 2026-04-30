// POST /api/attendance/teacher-heartbeat
// Background location ping from teacher's device during an active lesson.
// Called every 3-5 minutes by the frontend.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

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
    session_id?: string
    lat?: number
    lng?: number
  }

  const { session_id, lat, lng } = body

  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // Verify the session belongs to this school
  const { data: session } = await db
    .from('lesson_sessions')
    .select('id, teacher_id, school_id, session_status')
    .eq('id', session_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.session_status !== 'checked_in') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 409 })
  }

  // Determine geofence status
  let within_geofence = false
  let confidence_score = 50

  if (lat != null && lng != null) {
    const { data: tenant } = await db
      .from('tenant_configs')
      .select('school_lat, school_lng, geofence_radius_meters')
      .eq('school_id', auth.schoolId)
      .single()

    if (tenant?.school_lat && tenant?.school_lng) {
      const radius = (tenant as { geofence_radius_meters?: number }).geofence_radius_meters ?? 500
      const dist = haversineMetres(lat, lng, tenant.school_lat, tenant.school_lng)
      within_geofence = dist <= radius
      confidence_score = within_geofence ? Math.max(0, Math.round(100 - (dist / radius) * 50)) : 10
    }
  }

  const { data: staff } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  await db.from('lesson_heartbeats').insert({
    school_id:       auth.schoolId,
    lesson_id:       session_id,
    teacher_id:      staff?.id ?? auth.userId,
    lat:             lat ?? null,
    lng:             lng ?? null,
    within_geofence,
    confidence_score,
  })

  return NextResponse.json({ ok: true, within_geofence, confidence_score })
}

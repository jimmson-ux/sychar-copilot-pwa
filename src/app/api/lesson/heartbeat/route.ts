// POST /api/lesson/heartbeat
// Called by SW every 5 min during an active lesson session.
// Body: { lesson_id, lat, lng, confidence_score, battery_level? }

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// 25m geofence threshold (same as validate-lesson)
function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const a  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId } = auth
  const body = await req.json() as {
    lesson_id:          string
    lat?:               number
    lng?:               number
    confidence_score?:  number
  }

  if (!body.lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 })

  const db = svc()

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  // Fetch the lesson session to check geofence anchor
  const { data: lesson } = await db
    .from('lesson_sessions')
    .select('id, teacher_id, lat, lng, is_active')
    .eq('id', body.lesson_id)
    .eq('school_id', schoolId!)
    .single()

  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  if (!(lesson as { is_active: boolean }).is_active) {
    return NextResponse.json({ error: 'Lesson is not active' }, { status: 409 })
  }

  const sessionLat = (lesson as { lat: number | null }).lat
  const sessionLng = (lesson as { lng: number | null }).lng

  let within_geofence = false
  if (body.lat != null && body.lng != null && sessionLat != null && sessionLng != null) {
    within_geofence = distanceMetres(body.lat, body.lng, sessionLat, sessionLng) <= 25
  }

  const { error } = await db.from('lesson_heartbeats').insert({
    school_id:        schoolId,
    lesson_id:        body.lesson_id,
    teacher_id:       staff.id,
    timestamp:        new Date().toISOString(),
    lat:              body.lat ?? null,
    lng:              body.lng ?? null,
    within_geofence,
    confidence_score: body.confidence_score ?? 0,
  })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ ok: true, within_geofence })
}

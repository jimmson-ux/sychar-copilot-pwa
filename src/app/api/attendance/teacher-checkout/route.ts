// POST /api/attendance/teacher-checkout
// Teacher manually closes a lesson session.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

function calcComplianceScore(params: {
  checkinTime: string
  checkoutTime: string
  scheduledStart: string
  scheduledEnd: string
  withinGeofenceCount: number
  totalHeartbeats: number
}): number {
  const { checkinTime, checkoutTime, scheduledStart, scheduledEnd, withinGeofenceCount, totalHeartbeats } = params

  const today = new Date().toISOString().slice(0, 10)
  const start   = new Date(`${today}T${scheduledStart}`)
  const end     = new Date(`${today}T${scheduledEnd}`)
  const checkin = new Date(checkinTime)
  const checkout = new Date(checkoutTime)

  const scheduledMins = (end.getTime() - start.getTime()) / 60000
  const actualMins    = (checkout.getTime() - checkin.getTime()) / 60000

  // Punctuality (0-40 pts): full 40 if within grace, -2 per minute late
  const lateMin = Math.max(0, (checkin.getTime() - start.getTime()) / 60000)
  const punctuality = Math.max(0, 40 - lateMin * 2)

  // Duration (0-40 pts): proportional to scheduled time
  const duration = scheduledMins > 0
    ? Math.min(40, Math.round((actualMins / scheduledMins) * 40))
    : 20

  // Presence (0-20 pts): fraction of heartbeats within geofence
  const presence = totalHeartbeats > 0
    ? Math.round((withinGeofenceCount / totalHeartbeats) * 20)
    : 10 // no heartbeats — neutral

  return Math.min(100, Math.max(0, punctuality + duration + presence))
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    session_id?: string
    topic_covered?: string
    notes?: string
    lat?: number
    lng?: number
  }

  const { session_id, topic_covered, notes, lat, lng } = body

  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // Fetch session — must belong to this school and be active
  const { data: session } = await db
    .from('lesson_sessions')
    .select('id, teacher_id, school_id, session_status, checkin_time, start_time, end_time')
    .eq('id', session_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.session_status !== 'checked_in') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 409 })
  }

  // Count heartbeats for compliance score
  const { data: beats } = await db
    .from('lesson_heartbeats')
    .select('within_geofence')
    .eq('lesson_id', session_id)

  const totalHeartbeats     = beats?.length ?? 0
  const withinGeofenceCount = beats?.filter((b: { within_geofence: boolean }) => b.within_geofence).length ?? 0

  const checkoutTime = new Date().toISOString()

  const complianceScore = session.checkin_time && session.start_time && session.end_time
    ? calcComplianceScore({
        checkinTime:         session.checkin_time as string,
        checkoutTime,
        scheduledStart:      session.start_time as string,
        scheduledEnd:        session.end_time as string,
        withinGeofenceCount,
        totalHeartbeats,
      })
    : 50

  const { error } = await db
    .from('lesson_sessions')
    .update({
      session_status:   'completed',
      checkout_time:    checkoutTime,
      checkout_lat:     lat ?? null,
      checkout_lng:     lng ?? null,
      compliance_score: complianceScore,
      topic_covered:    topic_covered ?? null,
      notes:            notes ?? null,
      is_active:        false,
    })
    .eq('id', session_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to checkout' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, compliance_score: complianceScore })
}

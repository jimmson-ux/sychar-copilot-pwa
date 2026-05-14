/**
 * process-genesis-scan
 *
 * Handles the "First Scan" Genesis Protocol — automatically maps a classroom
 * by locking its GPS coordinates from the admin's phone.
 *
 * Security:
 *   1. Role check: only Principal / Deputy can perform genesis scans
 *   2. Idempotency: already-locked rooms return 409 with current coords
 *   3. Accuracy gate: GPS accuracy must be < 10 m (reject weak signals)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

const GENESIS_ROLES = new Set([
  'principal',
  'deputy_principal',
  'deputy_principal_academic',
  'deputy_principal_admin',
  'super_admin',
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

    if (!GENESIS_ROLES.has(auth.role)) {
      return json({
        error: 'Only the Principal or Deputy Principal can perform Genesis scans. Ask them to do the setup walk.',
      }, 403)
    }

    const body = await req.json()
    const {
      classroom_id,
      device_latitude,
      device_longitude,
      accuracy_radius,
    }: {
      classroom_id: string
      device_latitude: number
      device_longitude: number
      accuracy_radius: number
    } = body

    if (!classroom_id || device_latitude == null || device_longitude == null || accuracy_radius == null) {
      return json({ error: 'classroom_id, device_latitude, device_longitude, accuracy_radius are all required' }, 400)
    }

    // ── Accuracy Gate ────────────────────────────────────────────────────────
    // GPS indoors can be weak. Require < 10 m for the genesis lock to be meaningful.
    if (accuracy_radius > 10) {
      return json({
        error: `GPS signal too weak (±${Math.round(accuracy_radius)} m). Step closer to a window or stand in the doorway and wait for a green signal.`,
        accuracy_meters: accuracy_radius,
        gate_failed: true,
      }, 400)
    }

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Fetch classroom ──────────────────────────────────────────────────────
    const { data: classroom, error: cErr } = await svc
      .from('classrooms')
      .select('id, room_name, school_id, is_geofence_locked, geo_latitude, geo_longitude, locked_at_timestamp')
      .eq('id', classroom_id)
      .eq('school_id', auth.schoolId)
      .single()

    if (cErr || !classroom) {
      return json({ error: 'Classroom not found in this school' }, 404)
    }

    // ── Already locked — return current lock info ────────────────────────────
    if (classroom.is_geofence_locked) {
      return json({
        already_locked: true,
        room_name: classroom.room_name,
        geo_latitude: classroom.geo_latitude,
        geo_longitude: classroom.geo_longitude,
        locked_at: classroom.locked_at_timestamp,
        error: 'Room already mapped. Contact IT to reset the geofence.',
      }, 409)
    }

    // ── Genesis Lock ─────────────────────────────────────────────────────────
    const { error: uErr } = await svc
      .from('classrooms')
      .update({
        geo_latitude: device_latitude,
        geo_longitude: device_longitude,
        is_geofence_locked: true,
        locked_by_user_id: auth.userId,
        locked_at_timestamp: new Date().toISOString(),
        genesis_accuracy_m: accuracy_radius,
      })
      .eq('id', classroom_id)
      .eq('school_id', auth.schoolId)

    if (uErr) {
      console.error('[process-genesis-scan] update error', uErr)
      return json({ error: 'Failed to lock room coordinates' }, 500)
    }

    console.log(
      `[genesis] Locked ${classroom.room_name} at (${device_latitude}, ${device_longitude}) ±${accuracy_radius}m by user ${auth.userId}`,
    )

    return json({
      ok: true,
      room_name: classroom.room_name,
      geo_latitude: device_latitude,
      geo_longitude: device_longitude,
      accuracy_meters: accuracy_radius,
      message: `${classroom.room_name} location successfully synthesized and locked. Teachers can now check in to this room.`,
    })
  } catch (err) {
    console.error('[process-genesis-scan]', err)
    return json({ error: 'Genesis scan processing failed' }, 500)
  }
})

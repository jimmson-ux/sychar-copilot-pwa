/**
 * process-genesis-scan
 *
 * Handles the Genesis Protocol — locks a classroom's GPS centroid from the
 * admin's phone after the frontend has already collected 8 inverse-variance-
 * weighted samples and sent their combined centroid + effective accuracy.
 *
 * Accuracy guarantee chain:
 *   Frontend  → 8 samples, each ≤ 8 m, weighted centroid, Kalman-combined σ
 *   This fn   → rejects if effective accuracy > 8 m, sets per-room geofence
 *               radius = clamp(σ × 4 + 10, 15, 40) metres
 *   Self-heal → trigger refine_gps_drift() uses inverse-variance AVG after
 *               50 verified teacher scans (SQL migration)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

// Effective accuracy gate for the weighted centroid sent by the frontend.
// 8 m aligns with the frontend's per-sample rejection threshold.
const ACCURACY_GATE_M = 8

// Geofence radius formula: clamp(σ × 4 + 10, 15, 40) metres.
// Tighter genesis → tighter geofence; loose genesis → wider safety margin.
function computeGeofenceRadius(effectiveAccuracyM: number): number {
  return Math.min(40, Math.max(15, effectiveAccuracyM * 4 + 10))
}

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

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Capability check (principal-delegable) ──────────────────────────────
    // Genesis geofence-locking is no longer restricted to a fixed role set;
    // the principal can delegate it (e.g. Oloolaiser: deputy + one of choice).
    const { data: scanner } = await svc
      .from('staff_records')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .maybeSingle()

    const { data: canLock } = scanner
      ? await svc.rpc('has_genesis_capability', {
          p_staff_id: scanner.id,
          p_capability: 'lock_geofence',
        })
      : { data: false }

    if (!canLock) {
      return json({
        error: 'You are not authorised to lock classroom geofences. Ask the principal to delegate this to you.',
      }, 403)
    }

    const body = await req.json()
    const {
      classroom_id,
      device_latitude,
      device_longitude,
      accuracy_radius,   // effective Kalman-combined σ from frontend weighted centroid
      sample_count,      // number of raw samples that produced this centroid
    }: {
      classroom_id: string
      device_latitude: number
      device_longitude: number
      accuracy_radius: number
      sample_count?: number
    } = body

    if (!classroom_id || device_latitude == null || device_longitude == null || accuracy_radius == null) {
      return json({
        error: 'classroom_id, device_latitude, device_longitude, accuracy_radius are all required',
      }, 400)
    }

    // ── Accuracy gate ─────────────────────────────────────────────────────────
    // The frontend sends the Kalman-combined error of the weighted centroid.
    // Reject if the combined error exceeds our threshold.
    if (accuracy_radius > ACCURACY_GATE_M) {
      return json({
        error: `Centroid accuracy too low (±${accuracy_radius.toFixed(1)} m). ` +
               `Collect more samples indoors near a window. Required: ≤ ${ACCURACY_GATE_M} m.`,
        accuracy_meters: accuracy_radius,
        gate_failed: true,
      }, 400)
    }

    // ── Fetch classroom ───────────────────────────────────────────────────────
    const { data: classroom, error: cErr } = await svc
      .from('classrooms')
      .select('id, room_name, school_id, is_geofence_locked, geo_latitude, geo_longitude, locked_at_timestamp')
      .eq('id', classroom_id)
      .eq('school_id', auth.schoolId)
      .single()

    if (cErr || !classroom) {
      return json({ error: 'Classroom not found in this school' }, 404)
    }

    // ── Already locked ────────────────────────────────────────────────────────
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

    // ── Compute per-room geofence radius ──────────────────────────────────────
    const geofenceRadiusM = computeGeofenceRadius(accuracy_radius)

    // ── Genesis lock — write centroid + radius ────────────────────────────────
    const { error: uErr } = await svc
      .from('classrooms')
      .update({
        geo_latitude:         device_latitude,
        geo_longitude:        device_longitude,
        is_geofence_locked:   true,
        locked_by_user_id:    auth.userId,
        locked_at_timestamp:  new Date().toISOString(),
        genesis_accuracy_m:   accuracy_radius,
        genesis_sample_count: sample_count ?? null,
        geofence_radius_m:    geofenceRadiusM,
      })
      .eq('id', classroom_id)
      .eq('school_id', auth.schoolId)

    if (uErr) {
      console.error('[process-genesis-scan] update error', uErr)
      return json({ error: 'Failed to lock room coordinates' }, 500)
    }

    // ── Seed classroom_gps_logs with the genesis centroid ─────────────────────
    // Mark used_for_centroid = true so the self-heal trigger doesn't count this
    // founding reading in the next refinement batch.
    if (scanner) {
      await svc.from('classroom_gps_logs').insert({
        classroom_id:          classroom_id,
        school_id:             auth.schoolId,
        teacher_id:            scanner.id,
        scan_latitude:         device_latitude,
        scan_longitude:        device_longitude,
        accuracy_meters:       accuracy_radius,
        distance_to_center_m:  0,           // genesis IS the centre
        used_for_centroid:     true,         // genesis reading — exclude from self-heal batch
      })
    }

    console.log(
      `[genesis] Locked "${classroom.room_name}" at (${device_latitude}, ${device_longitude}) ` +
      `±${accuracy_radius.toFixed(2)} m (${sample_count ?? '?'} samples) → ` +
      `geofence radius ${geofenceRadiusM} m  user=${auth.userId}`,
    )

    return json({
      ok: true,
      room_name:        classroom.room_name,
      geo_latitude:     device_latitude,
      geo_longitude:    device_longitude,
      accuracy_meters:  accuracy_radius,
      geofence_radius_m: geofenceRadiusM,
      sample_count:     sample_count ?? null,
      message:
        `${classroom.room_name} locked at ±${accuracy_radius.toFixed(1)} m ` +
        `with a ${geofenceRadiusM} m geofence. Teachers can now check in.`,
    })
  } catch (err) {
    console.error('[process-genesis-scan]', err)
    return json({ error: 'Genesis scan processing failed' }, 500)
  }
})

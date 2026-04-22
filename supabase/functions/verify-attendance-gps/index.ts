import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'

const SCHOOL_LAT = -1.3833
const SCHOOL_LNG = 36.7833
const MAX_DISTANCE_METERS = 300

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const origin = req.headers.get('origin')

  try {
    const { token, lat, lng } = await req.json()

    if (!token || lat === undefined || lng === undefined) {
      return new Response(JSON.stringify({ error: 'token, lat, and lng required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: clockIn, error: tokenError } = await supabase
      .from('pending_clock_ins')
      .select('*')
      .eq('token', token)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (tokenError || !clockIn) {
      return new Response(JSON.stringify({
        error: 'Invalid or expired verification link. Please SMS "IN" again.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const distance = haversineDistance(lat, lng, SCHOOL_LAT, SCHOOL_LNG)
    const isOnsite = distance <= MAX_DISTANCE_METERS

    await supabase
      .from('pending_clock_ins')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        lat,
        lng,
        distance_from_school_m: Math.round(distance),
      })
      .eq('token', token)

    const today = new Date().toISOString().split('T')[0]
    await supabase.from('staff_attendance').upsert([{
      staff_id: clockIn.staff_id,
      school_id: clockIn.school_id,
      date: today,
      status: 'present',
      check_in_at: new Date().toISOString(),
      lat,
      lng,
      distance_from_school_m: Math.round(distance),
      geolocation_verified: isOnsite,
      submitted_via: 'sms_gps',
    }], { onConflict: 'staff_id,date' })

    const { data: staff } = await supabase
      .from('staff_records')
      .select('full_name')
      .eq('id', clockIn.staff_id)
      .single()

    return new Response(JSON.stringify({
      success: true,
      verified: true,
      onsite: isOnsite,
      distance: Math.round(distance),
      name: staff?.full_name || 'Staff',
      message: isOnsite
        ? `✅ Clock-in confirmed! You are ${Math.round(distance)}m from school.`
        : `⚠️ Clock-in recorded but you appear to be ${Math.round(distance)}m from school. Please contact administration.`,
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (err) {
    console.error('[verify-attendance-gps]', err)
    return new Response(JSON.stringify({ error: 'Verification failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})

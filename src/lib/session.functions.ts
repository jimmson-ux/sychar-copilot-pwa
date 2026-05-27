'use server'

import { createClient }  from '@supabase/supabase-js'
import { requireAuth }   from '@/lib/requireAuth'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Active sessions ───────────────────────────────────────────────

export async function getActiveSessions() {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin       = getAdmin()
  const today       = new Date().toISOString().slice(0, 10)
  const dropCutoff  = new Date(Date.now() - 20 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('teacher_attendance_scans')
    .select(`
      id, teacher_id, teacher_name, class_id, class_name, subject,
      expected_start, expected_end, scanned_at, late_minutes, status,
      last_heartbeat_at, lesson_completed_at, left_early_at, left_early_minutes
    `)
    .eq('school_id', auth.schoolId)
    .eq('scan_date', today)
    .order('scanned_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((s) => ({
    ...s,
    session_state: deriveState(s, dropCutoff),
  }))
}

function deriveState(
  s: { lesson_completed_at: string | null; last_heartbeat_at: string | null; scanned_at: string | null },
  dropCutoff: string
): 'pending' | 'active' | 'dropped' | 'complete' {
  if (s.lesson_completed_at) return 'complete'
  if (s.last_heartbeat_at && s.last_heartbeat_at < dropCutoff) return 'dropped'
  if (s.scanned_at) return 'active'
  return 'pending'
}

// ── Schedule overrides ────────────────────────────────────────────

export async function getTodayOverrides(date?: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin   = getAdmin()
  const forDate = date ?? new Date().toISOString().slice(0, 10)

  const { data, error } = await admin
    .from('active_schedule_overrides')
    .select(`
      id, original_lesson_id, override_date, new_teacher_id, new_room,
      override_reason, is_active, created_at,
      timetable_periods!original_lesson_id (
        class_name, subject, period_number, start_time, end_time, teacher_name
      ),
      staff_records!new_teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('override_date', forDate)
    .eq('is_active', true)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createOverride(payload: {
  original_lesson_id: string
  new_teacher_id?:    string
  new_room?:          string
  override_reason?:   string
  override_date?:     string
}) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const DEPUTY_ROLES = [
    'deputy_principal','deputy_principal_academic','dean_of_studies',
    'principal','super_admin',
  ]
  if (!DEPUTY_ROLES.includes(auth.subRole)) throw new Error('Forbidden')

  const admin = getAdmin()

  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  const today = payload.override_date ?? new Date().toISOString().slice(0, 10)

  const { data, error } = await admin
    .from('active_schedule_overrides')
    .upsert(
      {
        school_id:          auth.schoolId,
        original_lesson_id: payload.original_lesson_id,
        override_date:      today,
        new_teacher_id:     payload.new_teacher_id ?? null,
        new_room:           payload.new_room ?? null,
        override_reason:    payload.override_reason ?? null,
        created_by:         staff?.id ?? null,
        is_active:          true,
      },
      { onConflict: 'original_lesson_id,override_date' }
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function cancelOverride(overrideId: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const DEPUTY_ROLES = [
    'deputy_principal','deputy_principal_academic','dean_of_studies',
    'principal','super_admin',
  ]
  if (!DEPUTY_ROLES.includes(auth.subRole)) throw new Error('Forbidden')

  const admin = getAdmin()
  const { error } = await admin
    .from('active_schedule_overrides')
    .update({ is_active: false })
    .eq('id', overrideId)
    .eq('school_id', auth.schoolId)

  if (error) throw new Error(error.message)
}

// ── Push subscription management ─────────────────────────────────

export async function savePushSubscription(sub: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()

  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!staff) throw new Error('Staff record not found')

  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        school_id:  auth.schoolId,
        staff_id:   staff.id,
        endpoint:   sub.endpoint,
        p256dh:     sub.keys.p256dh,
        auth:       sub.keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,endpoint' }
    )

  if (error) throw new Error(error.message)
}

export async function removePushSubscription(endpoint: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()

  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!staff) return

  await admin
    .from('push_subscriptions')
    .delete()
    .eq('staff_id', staff.id)
    .eq('endpoint', endpoint)
}

// ── Current lesson (with override applied) ───────────────────────

export async function getCurrentLessonView(schoolId?: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin    = getAdmin()
  const sid      = schoolId ?? auth.schoolId

  // Resolve staff_records.id for this user
  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', sid)
    .maybeSingle()

  if (!staff) throw new Error('Staff record not found')

  // Compute current EAT time
  const eatMs   = Date.now() + 3 * 60 * 60 * 1000
  const eatNow  = new Date(eatMs)
  const eatTime = `${eatNow.getUTCHours().toString().padStart(2,'0')}:${eatNow.getUTCMinutes().toString().padStart(2,'0')}:00`
  const dow     = eatNow.getUTCDay() // 0=Sun
  const isoDow  = dow === 0 ? 1 : dow === 6 ? 5 : dow

  // Query current_lesson_view for this teacher right now
  const { data, error } = await admin
    .from('current_lesson_view')
    .select('*')
    .eq('school_id', sid)
    .eq('day_of_week', isoDow)
    .eq('is_active', true)
    .lte('start_time', eatTime)
    .gte('end_time', eatTime)
    .eq('effective_teacher_id', staff.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

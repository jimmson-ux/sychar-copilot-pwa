// Bot session management — school_id is PINNED at registration, never overridable by message content.
// All query handlers MUST use session.school_id exclusively.

import { SupabaseClient } from '@supabase/supabase-js'

export type SessionState =
  | 'awaiting_school'
  | 'awaiting_admission'
  | 'awaiting_otp'
  | 'awaiting_consent'
  | 'active'

export interface BotSession {
  id:                string
  phone:             string
  school_id:         string | null   // NULL only in awaiting_school state
  student_ids:       string[]
  active_student_id: string | null
  state:             SessionState
  consent_given:     boolean
}

// ── Fetch session by phone, creating a new one if not found ──────────────────

export async function getOrCreateSession(
  phone: string,
  db: SupabaseClient
): Promise<BotSession> {
  const { data: existing } = await db
    .from('parent_bot_sessions')
    .select('id, phone, school_id, student_ids, active_student_id, state, consent_given')
    .eq('phone', phone)
    .single()

  if (existing) {
    await db.from('parent_bot_sessions').update({ last_active: new Date().toISOString() }).eq('phone', phone)
    return existing as BotSession
  }

  const { data: created } = await db
    .from('parent_bot_sessions')
    .insert({ phone, state: 'awaiting_school' })
    .select('id, phone, school_id, student_ids, active_student_id, state, consent_given')
    .single()

  return created as BotSession
}

// ── Pin school_id (called once during registration — cannot be changed after) ─

export async function pinSchoolId(
  phone: string,
  schoolId: string,
  db: SupabaseClient
): Promise<void> {
  // Only update if school_id is still NULL — prevents overwrite after pinning
  await db
    .from('parent_bot_sessions')
    .update({ school_id: schoolId, state: 'awaiting_admission', last_active: new Date().toISOString() })
    .eq('phone', phone)
    .is('school_id', null)  // ← guard: only updates rows where school_id is not yet set
}

// ── Advance session state ─────────────────────────────────────────────────────

export async function advanceState(
  phone: string,
  state: SessionState,
  extra: Partial<Pick<BotSession, 'student_ids' | 'active_student_id' | 'consent_given'>> = {},
  db: SupabaseClient
): Promise<void> {
  const updates: Record<string, unknown> = { state, last_active: new Date().toISOString() }
  if (extra.student_ids       !== undefined) updates.student_ids       = extra.student_ids
  if (extra.active_student_id !== undefined) updates.active_student_id = extra.active_student_id
  if (extra.consent_given     !== undefined) {
    updates.consent_given = extra.consent_given
    if (extra.consent_given) updates.consent_at = new Date().toISOString()
  }
  await db.from('parent_bot_sessions').update(updates).eq('phone', phone)
}

// ── OTP helpers ───────────────────────────────────────────────────────────────

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function storeOtp(phone: string, otp: string, db: SupabaseClient): Promise<void> {
  // Expire previous OTPs for this phone
  await db.from('bot_otps').update({ used_at: new Date().toISOString() }).eq('phone', phone).is('used_at', null)
  // Insert new OTP, valid for 10 minutes
  await db.from('bot_otps').insert({
    phone,
    otp_code:   otp,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
}

export async function verifyOtp(phone: string, candidate: string, db: SupabaseClient): Promise<boolean> {
  const { data } = await db
    .from('bot_otps')
    .select('id, otp_code, expires_at')
    .eq('phone', phone)
    .is('used_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return false
  if ((data as { otp_code: string }).otp_code !== candidate.trim()) return false

  await db.from('bot_otps').update({ used_at: new Date().toISOString() }).eq('id', (data as { id: string }).id)
  return true
}

// ── Reset session (for testing / stuck states) ────────────────────────────────

export async function resetSession(phone: string, db: SupabaseClient): Promise<void> {
  await db.from('parent_bot_sessions').delete().eq('phone', phone)
}

// ── Look up if a phone belongs to a principal (for morning brief replies) ─────

export interface PrincipalInfo {
  school_id: string
  staff_id:  string
  name:      string
}

export async function getPrincipalByPhone(
  phone: string,
  db: SupabaseClient
): Promise<PrincipalInfo | null> {
  // staff_records may have a phone column, or we join auth.users
  // Try staff_records.phone first
  const { data } = await db
    .from('staff_records')
    .select('id, school_id, full_name')
    .eq('phone', phone)
    .eq('sub_role', 'principal')
    .eq('is_active', true)
    .single()

  if (!data) return null
  const d = data as { id: string; school_id: string; full_name: string }
  return { school_id: d.school_id, staff_id: d.id, name: d.full_name }
}

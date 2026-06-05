// Fingerprint attendance core (ZKTeco ADMS / iClock).
// Resolves device serial -> school, device user id -> student/teacher, logs an
// attendance event, toggles presence, and fires a rich parent web-push.
import { createClient } from '@supabase/supabase-js'

export function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
type DB = ReturnType<typeof svc>

export type RawScan = { device_user_id: string; event_at: string; status?: string }

/** One parsed ATTLOG line: "userid \t YYYY-MM-DD HH:MM:SS \t status \t verify ..." */
export function parseAttlog(body: string): RawScan[] {
  const out: RawScan[] = []
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split(/\t/).length > 1 ? t.split(/\t/) : t.split(/\s{2,}/)
    if (parts.length < 2) continue
    const device_user_id = parts[0]?.trim()
    const event_at = (parts[1] ?? '').trim()
    const status = (parts[3] ?? parts[2] ?? '').trim()
    if (device_user_id && event_at) out.push({ device_user_id, event_at, status })
  }
  return out
}

function nairobiTime(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
}
function dayKey(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 10)
}

/** Resolve a device by serial. Returns null (caller rejects) if unknown/inactive. */
export async function resolveDevice(db: DB, serial: string) {
  const { data } = await db
    .from('biometric_devices')
    .select('id, school_id, device_role, push_token, is_active')
    .eq('serial_number', serial)
    .maybeSingle()
  if (data?.is_active) {
    await db.from('biometric_devices').update({ last_seen_at: new Date().toISOString() }).eq('serial_number', serial).then(() => {}, () => {})
  }
  return (data?.is_active ? data : null) as { id: string; school_id: string; device_role: string; push_token: string | null } | null
}

/** Process scans from one device: log events, toggle presence, push parents. */
export async function processScans(db: DB, serial: string, school_id: string, scans: RawScan[]) {
  let logged = 0
  for (const s of scans) {
    const { data: enr } = await db
      .from('biometric_enrollments')
      .select('subject_type, student_id, staff_id')
      .eq('device_serial', serial)
      .eq('device_user_id', s.device_user_id)
      .maybeSingle()
    if (!enr) continue // unknown user id on this device — skip (enroll first)

    const eventIso = new Date(s.event_at.replace(' ', 'T')).toISOString()

    // Direction: explicit status if it encodes out (1/out), else toggle off last event today.
    let direction: 'in' | 'out'
    const st = (s.status ?? '').toLowerCase()
    if (st === '1' || st === 'out' || st === 'checkout') direction = 'out'
    else if (st === '0' || st === 'in' || st === 'checkin') direction = 'in'
    else {
      const col = (enr as any).subject_type === 'teacher' ? 'staff_id' : 'student_id'
      const subjId = (enr as any).subject_type === 'teacher' ? (enr as any).staff_id : (enr as any).student_id
      const { data: last } = await db
        .from('attendance_events')
        .select('direction')
        .eq('school_id', school_id).eq(col, subjId)
        .gte('event_at', `${dayKey(s.event_at)}T00:00:00Z`)
        .order('event_at', { ascending: false }).limit(1).maybeSingle()
      direction = (last as any)?.direction === 'in' ? 'out' : 'in'
    }

    await db.from('attendance_events').insert({
      school_id,
      subject_type: (enr as any).subject_type,
      student_id: (enr as any).student_id ?? null,
      staff_id: (enr as any).staff_id ?? null,
      device_serial: serial,
      direction,
      event_at: eventIso,
      raw: JSON.stringify(s),
    })
    logged++

    if ((enr as any).subject_type === 'student' && (enr as any).student_id) {
      const presence = direction === 'in'
        ? { is_in_school: true, last_seen_in_at: eventIso }
        : { is_in_school: false, last_seen_out_at: eventIso }
      await db.from('students').update(presence).eq('id', (enr as any).student_id).then(() => {}, () => {})
      await pushParentAttendance(db, school_id, (enr as any).student_id, direction, nairobiTime(s.event_at), dayKey(s.event_at))
    }
  }
  return { logged }
}

/** Rich parent web-push via the wazazi VAPID relay (free, beats SMS). */
async function pushParentAttendance(db: DB, school_id: string, student_id: string, direction: 'in' | 'out', time: string, day: string) {
  const secret = process.env.STAFF_JWT_SECRET
  if (!secret) return
  const { data: stu } = await db.from('students').select('full_name, photo_url').eq('id', student_id).maybeSingle()
  const name = (stu as any)?.full_name ?? 'Your child'
  const wazazi = process.env.WAZAZI_BASE_URL ?? 'https://wazazi.sychar.co.ke'
  const body = direction === 'in'
    ? `${name} checked in safely at ${time}.`
    : `${name} checked out at ${time}.`
  await fetch(`${wazazi}/api/internal/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      school_id,
      student_ids: [student_id],
      title: 'Sychar • Gate Alert',
      body,
      type: 'attendance',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      image: (stu as any)?.photo_url ?? undefined,
      tag: `attendance-${student_id}-${day}-${direction}`,
      url: `/attendance?studentId=${student_id}`,
      data: { url: `/attendance?studentId=${student_id}`, direction, time },
    }),
  }).catch(() => {})
}

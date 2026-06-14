// Fingerprint attendance core (ZKTeco ADMS / iClock).
// Built for bursts: 4 gate devices, 900+ students. The synchronous path (before the
// device gets "OK") is O(2-3 queries) per POST no matter how many scans it carries —
// batch enrollment lookup, one idempotent batch insert. Presence updates + parent
// web-pushes run AFTER the response (route uses `after()`), so the device never waits.
import { createClient } from '@supabase/supabase-js'

export function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
type DB = ReturnType<typeof svc>

export type RawScan = { device_user_id: string; event_at: string; status?: string }
/** A newly-logged student scan to drive presence + push (after the response). */
export type StudentEvent = { student_id: string; direction: 'in' | 'out'; event_at: string }

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

function toIso(raw: string): string {
  const d = new Date(raw.replace(' ', 'T'))
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
function nairobiTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
}
function dayKey(iso: string): string { return iso.slice(0, 10) }

/** Run async work over items with a concurrency cap (keeps big catch-up batches sane). */
async function runCapped<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]).catch(() => {}) }
  })
  await Promise.all(workers)
}

/** Resolve a device by serial. Returns null (caller rejects) if unknown/inactive. */
export async function resolveDevice(db: DB, serial: string) {
  const { data } = await db
    .from('biometric_devices')
    .select('id, school_id, device_role, push_token, is_active')
    .eq('serial_number', serial)
    .maybeSingle()
  if (data?.is_active) {
    // fire-and-forget heartbeat — never block ingest on it
    db.from('biometric_devices').update({ last_seen_at: new Date().toISOString() }).eq('serial_number', serial).then(() => {}, () => {})
  }
  return (data?.is_active ? data : null) as { id: string; school_id: string; device_role: string; push_token: string | null } | null
}

/**
 * Synchronous ingest path — batched + idempotent. Logs all scans, returns only the
 * NEWLY-inserted student events (duplicates from device retries are dropped by the
 * dedup index, so they neither re-log nor re-notify). Does NOT touch presence/push.
 */
export async function processScans(db: DB, serial: string, school_id: string, scans: RawScan[]): Promise<{ logged: number; studentEvents: StudentEvent[] }> {
  if (!scans.length) return { logged: 0, studentEvents: [] }

  // Process in chronological order so in-memory toggling is deterministic.
  const sorted = [...scans].sort((a, b) => a.event_at.localeCompare(b.event_at))
  const userIds = [...new Set(sorted.map((s) => s.device_user_id))]

  // 1) One query: map every device_user_id on this device -> subject.
  const { data: enrs } = await db
    .from('biometric_enrollments')
    .select('device_user_id, subject_type, student_id, staff_id')
    .eq('device_serial', serial)
    .in('device_user_id', userIds)
  const enrMap = new Map<string, any>((enrs ?? []).map((e: any) => [String(e.device_user_id), e]))
  if (!enrMap.size) return { logged: 0, studentEvents: [] }

  const explicit = (st?: string) => {
    const s = (st ?? '').toLowerCase()
    if (s === '1' || s === 'out' || s === 'checkout') return 'out' as const
    if (s === '0' || s === 'in' || s === 'checkin') return 'in' as const
    return null
  }

  // 2) One query (only if any scan lacks an explicit IN/OUT): today's last direction per subject,
  //    to seed the toggle. Repeated scans of the same subject in this batch toggle in memory.
  const runningDir = new Map<string, 'in' | 'out'>()
  const needToggle = sorted.some((s) => enrMap.has(s.device_user_id) && !explicit(s.status))
  if (needToggle) {
    const subj = sorted.map((s) => enrMap.get(s.device_user_id)).filter(Boolean)
    const stuIds = [...new Set(subj.filter((e) => e.student_id).map((e) => e.student_id))]
    const staffIds = [...new Set(subj.filter((e) => e.staff_id).map((e) => e.staff_id))]
    const dayStart = `${dayKey(toIso(sorted[0].event_at))}T00:00:00Z`
    const orParts: string[] = []
    if (stuIds.length) orParts.push(`student_id.in.(${stuIds.join(',')})`)
    if (staffIds.length) orParts.push(`staff_id.in.(${staffIds.join(',')})`)
    if (orParts.length) {
      const { data: evs } = await db
        .from('attendance_events')
        .select('student_id, staff_id, direction, event_at')
        .eq('school_id', school_id)
        .gte('event_at', dayStart)
        .or(orParts.join(','))
        .order('event_at', { ascending: true })
      for (const e of (evs ?? []) as any[]) {
        const k = e.student_id ? `s:${e.student_id}` : `t:${e.staff_id}`
        runningDir.set(k, e.direction)
      }
    }
  }

  // 3) Build rows (assign directions, toggling in memory for repeats).
  const rows = sorted.map((s) => {
    const enr = enrMap.get(s.device_user_id)
    if (!enr) return null
    const iso = toIso(s.event_at)
    const key = enr.student_id ? `s:${enr.student_id}` : `t:${enr.staff_id}`
    let direction = explicit(s.status)
    if (!direction) direction = runningDir.get(key) === 'in' ? 'out' : 'in'
    runningDir.set(key, direction)
    return {
      school_id,
      subject_type: enr.subject_type,
      student_id: enr.student_id ?? null,
      staff_id: enr.staff_id ?? null,
      device_serial: serial,
      device_user_id: s.device_user_id,
      direction,
      event_at: iso,
      raw: JSON.stringify(s),
    }
  }).filter(Boolean) as any[]
  if (!rows.length) return { logged: 0, studentEvents: [] }

  // 4) One idempotent batch insert. ignoreDuplicates -> resent scans are dropped, and only
  //    truly-new rows come back (so we never re-notify on a device retry).
  const { data: ins } = await db
    .from('attendance_events')
    .upsert(rows, { onConflict: 'device_serial,device_user_id,event_at', ignoreDuplicates: true })
    .select('student_id, direction, event_at, subject_type')

  const studentEvents: StudentEvent[] = (ins ?? [])
    .filter((r: any) => r.subject_type === 'student' && r.student_id)
    .map((r: any) => ({ student_id: r.student_id, direction: r.direction, event_at: r.event_at }))

  return { logged: (ins ?? []).length, studentEvents }
}

/**
 * After-response phase: update presence (latest event per student) and fan out rich parent
 * web-pushes. Stale catch-up scans (older than 20 min) are logged but NOT pushed, so a
 * reconnecting device doesn't blast hours-old notifications. Run via `after()` in the route.
 */
export async function applyPresenceAndPush(db: DB, school_id: string, events: StudentEvent[]) {
  if (!events.length) return
  const ids = [...new Set(events.map((e) => e.student_id))]

  // Latest event per student -> presence cache.
  const latest = new Map<string, StudentEvent>()
  for (const e of events) {
    const cur = latest.get(e.student_id)
    if (!cur || e.event_at > cur.event_at) latest.set(e.student_id, e)
  }

  // One query for names/photos (rich push).
  const { data: studs } = await db.from('students').select('id, full_name, photo_url').in('id', ids)
  const info = new Map<string, any>((studs ?? []).map((s: any) => [s.id, s]))

  // Open (approved, not-yet-returned) exeats → classify a check-in as a RETURN, not ARRIVAL.
  const { data: openExeats } = await db.from('exeat_requests')
    .select('id, student_id, leave_type')
    .eq('school_id', school_id).eq('status', 'approved').is('return_time', null)
    .in('student_id', ids)
  const exeatByStudent = new Map<string, any>((openExeats ?? []).map((x: any) => [x.student_id, x]))

  // Presence engine + movement timeline (capped concurrency).
  const nowIso = new Date().toISOString()
  await runCapped([...latest.values()], 20, async (e) => {
    const open = exeatByStudent.get(e.student_id)
    let movementType: string
    let status: string
    if (e.direction === 'in') {
      status = 'ON_CAMPUS'
      if (open) {
        movementType = open.leave_type === 'hospital' ? 'RETURN_FROM_HOSPITAL'
          : open.leave_type === 'exeat' ? 'RETURN_FROM_EXEAT' : 'RETURN_FROM_LEAVE'
        await db.from('exeat_requests').update({ return_time: e.event_at }).eq('id', open.id)
      } else {
        movementType = 'ARRIVAL'
      }
    } else {
      movementType = 'DEPARTURE'
      status = 'OFF_CAMPUS'
    }
    // Back-compat flag on students.
    const flag = e.direction === 'in'
      ? { is_in_school: true, last_seen_in_at: e.event_at }
      : { is_in_school: false, last_seen_out_at: e.event_at }
    await db.from('students').update(flag).eq('id', e.student_id)
    // Presence state machine.
    await db.from('student_presence').upsert({
      student_id: e.student_id, school_id, current_status: status,
      last_event: movementType, last_seen_at: e.event_at, updated_at: nowIso,
    }, { onConflict: 'student_id' })
    // Immutable movement timeline.
    await db.from('student_movements').insert({
      school_id, student_id: e.student_id, movement_type: movementType, event_at: e.event_at, actor: 'biometric',
    })
  })

  // Pushes for FRESH events only (avoid blasting stale offline backlog).
  const secret = process.env.STAFF_JWT_SECRET
  if (!secret) return
  const wazazi = process.env.WAZAZI_BASE_URL ?? 'https://wazazi.sychar.co.ke'
  const freshFloor = Date.now() - 20 * 60 * 1000
  const fresh = events.filter((e) => new Date(e.event_at).getTime() >= freshFloor)

  await runCapped(fresh, 20, async (e) => {
    const stu = info.get(e.student_id)
    const name = stu?.full_name ?? 'Your child'
    const time = nairobiTime(e.event_at)
    const body = e.direction === 'in' ? `${name} checked in safely at ${time}.` : `${name} checked out at ${time}.`
    await fetch(`${wazazi}/api/internal/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        school_id,
        student_ids: [e.student_id],
        title: 'Sychar • Gate Alert',
        body,
        type: 'attendance',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        image: stu?.photo_url ?? undefined,
        tag: `attendance-${e.student_id}-${dayKey(e.event_at)}-${e.direction}`,
        url: `/attendance?studentId=${e.student_id}`,
        data: { url: `/attendance?studentId=${e.student_id}`, direction: e.direction, time },
      }),
    })
  })
}

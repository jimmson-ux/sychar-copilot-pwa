// Edge function: sms-nts-attendance
// Receives inbound SMS from Textbee SIM-hosting webhook.
// Parses NTS attendance codes, records to nts_attendance, and always returns HTTP 200.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// NTS code format: SCHOOL_CODE|STAFF_CODE|STATUS
// e.g.  "SYC001|TCH042|P"  → present
//        "SYC001|TCH042|A"  → absent
//        "SYC001|TCH042|L"  → on leave
const NTS_PATTERN = /^([A-Z0-9]+)\|([A-Z0-9]+)\|(P|A|L|H|E)$/i

// Maps SMS code → nts_attendance_log.status values
const STATUS_MAP: Record<string, string> = {
  P: 'IN',
  A: 'ABSENT',
  L: 'LEAVE',
  H: 'HALF',
  E: 'LEAVE',
}

Deno.serve(async (req: Request) => {
  // Always return 200 to Textbee — never retry on error
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { from?: string; message?: string; timestamp?: string; deviceId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { from, message, timestamp, deviceId } = body
  const raw = (message ?? '').trim().toUpperCase()

  const match = NTS_PATTERN.exec(raw)
  if (!match) {
    console.warn('[sms-nts-attendance] unrecognised format:', raw, 'from:', from)
    return new Response(JSON.stringify({ ok: false, error: 'Unrecognised SMS format' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const [, schoolCode, staffCode, statusCode] = match
  const status = STATUS_MAP[statusCode.toUpperCase()] ?? 'present'

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Resolve school by short_code
  const { data: school } = await db
    .from('schools')
    .select('id')
    .eq('short_code', schoolCode)
    .single()

  if (!school) {
    console.warn('[sms-nts-attendance] school not found:', schoolCode)
    return new Response(JSON.stringify({ ok: false, error: 'School not found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const schoolId = (school as { id: string }).id

  // Resolve staff by nts_code or staff_code
  const { data: staff } = await db
    .from('staff_records')
    .select('id, full_name')
    .eq('school_id', schoolId)
    .or(`nts_code.eq.${staffCode},staff_code.eq.${staffCode}`)
    .single()

  if (!staff) {
    console.warn('[sms-nts-attendance] staff not found:', staffCode, 'school:', schoolCode)
    return new Response(JSON.stringify({ ok: false, error: 'Staff not found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  type StaffRow = { id: string; full_name: string }
  const s = staff as StaffRow

  const smsTs    = timestamp ? new Date(timestamp) : new Date()
  const dateStr  = smsTs.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }).split(',')[0]
  const dateISO  = (() => {
    const [m, d, y] = dateStr.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  })()

  // Upsert attendance record (one per staff per day)
  const { error } = await db
    .from('nts_attendance_log')
    .upsert({
      school_id:    schoolId,
      staff_id:     s.id,
      date:         dateISO,
      status,
      source:       'sms',
      raw_message:  raw,
      phone_from:   from ?? null,
      device_id:    deviceId ?? null,
      recorded_at:  smsTs.toISOString(),
    }, { onConflict: 'school_id,staff_id,date' })

  if (error) {
    console.error('[sms-nts-attendance] upsert error:', error.message)
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`[sms-nts-attendance] recorded ${s.full_name} → ${status} on ${dateISO}`)

  return new Response(JSON.stringify({ ok: true, staff: s.full_name, status, date: dateISO }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

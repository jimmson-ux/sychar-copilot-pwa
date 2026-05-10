import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { createHmac, timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/teacher/attendance/scan
 *
 * Teacher scans a class QR code to mark lesson attendance.
 *
 * Validation chain (all must pass):
 *   1. QR token HMAC verified (can't forge without server secret)
 *   2. QR belongs to this school
 *   3. Active lesson period exists for this class RIGHT NOW (EAT time)
 *   4. This teacher is assigned to that period in the timetable
 *   5. Not already scanned for this period today
 *   6. Within 10-minute grace window past lesson start
 *
 * Body: { qr_payload: string }   — the raw JSON from the QR code
 * Returns: { scan_id, lesson, late_minutes, heartbeat_interval_seconds }
 */

const GRACE_MINUTES    = 10  // allowed lateness before marking "late"
const HEARTBEAT_INTERVAL = 3  // minutes between expected heartbeats

function verifyQrToken(schoolId: string, classId: string, seq: number, token: string): boolean {
  const secret = process.env.CLASS_QR_SECRET
  if (!secret) return false
  const expected = createHmac('sha256', secret)
    .update(`${schoolId}:${classId}:${seq}`)
    .digest('hex')
  try {
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { qr_payload } = body as { qr_payload?: string }

  if (!qr_payload) {
    return NextResponse.json({ error: 'qr_payload is required' }, { status: 400 })
  }

  // ── Parse QR payload ───────────────────────────────────────────
  let qr: { v: number; s: string; c: string; t: string; seq: number }
  try {
    qr = JSON.parse(qr_payload)
  } catch {
    return NextResponse.json({ error: 'Invalid QR code' }, { status: 400 })
  }

  if (qr.v !== 1 || !qr.s || !qr.c || !qr.t || !qr.seq) {
    return NextResponse.json({ error: 'Malformed QR code' }, { status: 400 })
  }

  // School must match teacher's school
  if (qr.s !== auth.schoolId) {
    return NextResponse.json({ error: 'QR code belongs to a different school' }, { status: 403 })
  }

  // ── Verify HMAC ────────────────────────────────────────────────
  if (!verifyQrToken(qr.s, qr.c, qr.seq, qr.t)) {
    return NextResponse.json({ error: 'QR code is invalid or has been tampered with' }, { status: 401 })
  }

  const svc = createAdminSupabaseClient()

  // ── Confirm QR token is still active + seq matches ────────────
  const { data: qrRecord } = await svc
    .from('class_qr_tokens')
    .select('id, class_name, generation_seq, is_active')
    .eq('school_id', auth.schoolId)
    .eq('class_id', qr.c)
    .single()

  if (!qrRecord || !(qrRecord as { is_active: boolean }).is_active) {
    return NextResponse.json({ error: 'QR code is no longer active' }, { status: 410 })
  }
  if ((qrRecord as { generation_seq: number }).generation_seq !== qr.seq) {
    return NextResponse.json(
      { error: 'This QR code has been replaced. Please scan the new code.' },
      { status: 410 },
    )
  }

  // ── Find active timetable period for this class right now ──────
  const { data: periods } = await svc.rpc('get_active_period_for_class', {
    p_school_id: auth.schoolId,
    p_class_id:  qr.c,
  })

  const period = periods?.[0] as {
    period_id:    string
    subject:      string
    teacher_id:   string
    teacher_name: string
    start_time:   string
    end_time:     string
    period_type:  string
  } | undefined

  if (!period) {
    return NextResponse.json(
      { error: 'No lesson is scheduled for this class right now' },
      { status: 422 },
    )
  }

  // ── Confirm teacher is assigned to this period ─────────────────
  const { data: staffRow } = await svc
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId)
    .single()

  if (!staffRow) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  const staffId = (staffRow as { id: string }).id

  if (period.teacher_id !== staffId) {
    return NextResponse.json(
      { error: 'You are not assigned to teach this class in the current period' },
      { status: 403 },
    )
  }

  // ── Prevent double-scan for same period today ──────────────────
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await svc
    .from('teacher_attendance_scans')
    .select('id, status')
    .eq('teacher_id', staffId)
    .eq('timetable_period_id', period.period_id)
    .eq('scan_date', today)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      {
        error:     'You have already scanned in for this period today',
        scan_id:   (existing as { id: string }).id,
        status:    (existing as { status: string }).status,
        already_scanned: true,
      },
      { status: 409 },
    )
  }

  // ── Calculate lateness ─────────────────────────────────────────
  const nowEAT       = new Date(new Date().getTime() + 3 * 60 * 60 * 1000)
  const [sh, sm]     = period.start_time.split(':').map(Number)
  const startMinutes = sh * 60 + sm
  const nowMinutes   = nowEAT.getUTCHours() * 60 + nowEAT.getUTCMinutes()
  const lateMinutes  = Math.max(0, nowMinutes - startMinutes)
  const status       = lateMinutes >= GRACE_MINUTES ? 'late' : 'present'

  const deviceInfo = (req.headers.get('user-agent') ?? '').slice(0, 200)
  const ipAddress  = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? ''

  // ── Create attendance scan ─────────────────────────────────────
  const { data: scan, error: scanErr } = await svc
    .from('teacher_attendance_scans')
    .insert({
      school_id:           auth.schoolId,
      class_id:            qr.c,
      class_name:          (qrRecord as { class_name: string }).class_name,
      subject:             period.subject,
      teacher_id:          staffId,
      teacher_name:        (staffRow as { full_name: string }).full_name,
      timetable_period_id: period.period_id,
      qr_token_id:         (qrRecord as { id: string }).id,
      scan_date:           today,
      expected_start:      period.start_time,
      expected_end:        period.end_time,
      scanned_at:          new Date().toISOString(),
      late_minutes:        lateMinutes,
      status,
      device_info:         deviceInfo,
      ip_address:          ipAddress,
      last_heartbeat_at:   new Date().toISOString(),
    })
    .select('id')
    .single()

  if (scanErr || !scan) {
    console.error('[attendance/scan]', scanErr)
    return NextResponse.json({ error: 'Failed to record attendance' }, { status: 500 })
  }

  // Bump scan counter on QR token
  await svc
    .from('class_qr_tokens')
    .update({ scan_count: svc.rpc as unknown as never, last_scanned_at: new Date().toISOString() })
    .eq('id', (qrRecord as { id: string }).id)

  return NextResponse.json({
    scan_id:                  (scan as { id: string }).id,
    status,
    late_minutes:             lateMinutes,
    lesson: {
      class_name:  (qrRecord as { class_name: string }).class_name,
      subject:     period.subject,
      start_time:  period.start_time,
      end_time:    period.end_time,
    },
    heartbeat_interval_seconds: HEARTBEAT_INTERVAL * 60,
    message: status === 'late'
      ? `Scanned in ${lateMinutes} minute(s) late`
      : 'Attendance recorded — lesson started on time',
  })
}

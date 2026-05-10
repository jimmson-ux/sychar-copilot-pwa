import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/teacher/attendance/heartbeat
 *
 * Teacher PWA calls this every 3 minutes after scanning in.
 * The backend uses heartbeat gaps to detect if a teacher left
 * the classroom before the lesson ended.
 *
 * Rules:
 *   - If lesson has ended: mark scan as completed, stop expecting heartbeats.
 *   - If last heartbeat gap > ABSENT_THRESHOLD_MIN and lesson ongoing:
 *     set status = 'left_early', set left_early_at, send alert.
 *
 * Body: { scan_id: string }
 * Returns: { ok, lesson_ends_in_minutes, status }
 */

const ABSENT_THRESHOLD_MIN = 8  // gap > 8 min = presumed left classroom

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { scan_id } = body as { scan_id?: string }

  if (!scan_id) {
    return NextResponse.json({ error: 'scan_id is required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // ── Fetch scan and verify ownership ──────────────────────────
  const { data: staffRow } = await svc
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  if (!staffRow) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const { data: scan } = await svc
    .from('teacher_attendance_scans')
    .select(
      'id, teacher_id, school_id, expected_end, status, last_heartbeat_at, scan_date',
    )
    .eq('id', scan_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })

  type Scan = {
    id: string; teacher_id: string; school_id: string
    expected_end: string; status: string; last_heartbeat_at: string | null; scan_date: string
  }
  const s = scan as Scan

  if (s.teacher_id !== (staffRow as { id: string }).id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Already finalized
  if (['left_early', 'absent'].includes(s.status)) {
    return NextResponse.json({ ok: false, status: s.status, message: 'Attendance already closed' })
  }

  const now   = new Date()
  const nowEAT = new Date(now.getTime() + 3 * 60 * 60 * 1000)  // UTC+3

  // ── Check if lesson has ended ─────────────────────────────────
  const [eh, em] = s.expected_end.split(':').map(Number)
  const endMinutes = eh * 60 + em
  const nowMinutes = nowEAT.getUTCHours() * 60 + nowEAT.getUTCMinutes()
  const minutesRemaining = endMinutes - nowMinutes
  const lessonEnded = minutesRemaining <= 0

  if (lessonEnded) {
    await svc
      .from('teacher_attendance_scans')
      .update({
        status:              s.status === 'late' ? 'late' : 'present',
        lesson_completed_at: now.toISOString(),
        last_heartbeat_at:   now.toISOString(),
      })
      .eq('id', scan_id)

    return NextResponse.json({ ok: true, status: 'completed', lesson_ends_in_minutes: 0 })
  }

  // ── Record heartbeat ──────────────────────────────────────────
  const { count: seq } = await svc
    .from('lesson_heartbeats')
    .select('id', { count: 'exact', head: true })
    .eq('scan_id', scan_id)

  await svc.from('lesson_heartbeats').insert({
    scan_id:      scan_id,
    teacher_id:   (staffRow as { id: string }).id,
    school_id:    auth.schoolId,
    heartbeat_at: now.toISOString(),
    seq:          (seq ?? 0) + 1,
  })

  await svc
    .from('teacher_attendance_scans')
    .update({ last_heartbeat_at: now.toISOString() })
    .eq('id', scan_id)

  return NextResponse.json({
    ok:                     true,
    status:                 s.status,
    lesson_ends_in_minutes: minutesRemaining,
    next_heartbeat_seconds: 180,  // 3 minutes
  })
}

/**
 * GET /api/teacher/attendance/heartbeat?school_id=xxx
 * Called by the BACKEND CRON (or deputy dashboard) to detect teachers
 * whose heartbeats have gone silent mid-lesson.
 *
 * Marks left_early for any active scan where last_heartbeat_at is
 * older than ABSENT_THRESHOLD_MIN and the lesson is still ongoing.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const canCheck = ['deputy_principal','deputy_principal_academic','dean_of_studies','principal','super_admin']
    .includes(auth.subRole)
  if (!canCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc    = createAdminSupabaseClient()
  const cutoff = new Date(Date.now() - ABSENT_THRESHOLD_MIN * 60 * 1000).toISOString()
  const today  = new Date().toISOString().slice(0, 10)

  const { data: lagging } = await svc
    .from('teacher_attendance_scans')
    .select('id, teacher_name, class_name, subject, expected_end, last_heartbeat_at')
    .eq('school_id', auth.schoolId)
    .eq('scan_date', today)
    .in('status', ['present', 'late'])
    .lt('last_heartbeat_at', cutoff)

  const nowEAT     = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const nowMinutes = nowEAT.getUTCHours() * 60 + nowEAT.getUTCMinutes()

  const flagged: string[] = []

  for (const scan of lagging ?? []) {
    const s = scan as { id: string; expected_end: string }
    const [eh, em]   = s.expected_end.split(':').map(Number)
    const endMinutes = eh * 60 + em
    if (nowMinutes < endMinutes) {
      // Lesson still ongoing — teacher has gone silent
      await svc
        .from('teacher_attendance_scans')
        .update({ status: 'left_early', left_early_at: new Date().toISOString(), alert_sent: true })
        .eq('id', s.id)
      flagged.push(s.id)
    }
  }

  return NextResponse.json({
    checked:  (lagging ?? []).length,
    flagged:  flagged.length,
    scan_ids: flagged,
  })
}

// POST /api/timetable/session/heartbeat
// Teacher PWA sends a heartbeat ping every 10 minutes to keep their
// lesson session alive. Updates last_heartbeat_at on teacher_attendance_scans
// and inserts a row into lesson_heartbeats.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { scan_id, lat, lng } = body as {
    scan_id?: string
    lat?: number
    lng?: number
  }

  const admin = getAdmin()
  const today = new Date().toISOString().slice(0, 10)

  // Resolve staff record
  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  // Find active scan for today (by scan_id or most recent present scan)
  let scanRecord: { id: string } | null = null

  if (scan_id) {
    const { data } = await admin
      .from('teacher_attendance_scans')
      .select('id')
      .eq('id', scan_id)
      .eq('teacher_id', staff.id)
      .eq('school_id', auth.schoolId)
      .in('status', ['present', 'late'])
      .maybeSingle()
    scanRecord = data
  } else {
    const { data } = await admin
      .from('teacher_attendance_scans')
      .select('id')
      .eq('teacher_id', staff.id)
      .eq('school_id', auth.schoolId)
      .eq('scan_date', today)
      .in('status', ['present', 'late'])
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    scanRecord = data
  }

  if (!scanRecord) {
    return NextResponse.json({ error: 'No active session found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  // Update last_heartbeat_at on the scan record
  await admin
    .from('teacher_attendance_scans')
    .update({ last_heartbeat_at: now })
    .eq('id', scanRecord.id)

  // Log heartbeat
  const { data: lastHb } = await admin
    .from('lesson_heartbeats')
    .select('seq')
    .eq('scan_id', scanRecord.id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSeq = ((lastHb?.seq ?? 0) as number) + 1

  await admin.from('lesson_heartbeats').insert({
    scan_id:      scanRecord.id,
    teacher_id:   staff.id,
    school_id:    auth.schoolId,
    heartbeat_at: now,
    seq:          nextSeq,
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
  })

  return NextResponse.json({ ok: true, scan_id: scanRecord.id, seq: nextSeq })
}

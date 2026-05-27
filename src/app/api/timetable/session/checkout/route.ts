// POST /api/timetable/session/checkout
// Dual-mode checkout:
//   type: "qr"   — teacher rescans QR to explicitly close lesson
//   type: "auto" — system auto-closes sessions whose end_time has passed
// "auto" requires deputy/principal role; "qr" is self-service.

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

const ADMIN_ROLES = [
  'deputy_principal', 'deputy_principal_academic', 'dean_of_studies',
  'principal', 'super_admin',
]

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { type = 'qr', scan_id } = body as { type?: 'qr' | 'auto'; scan_id?: string }

  const admin = getAdmin()
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)

  if (type === 'auto') {
    // Admin-only: auto-close all sessions whose timetable end_time has passed
    if (!ADMIN_ROLES.includes(auth.subRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Current time in EAT
    const eatMs  = now.getTime() + 3 * 60 * 60 * 1000
    const eatNow = new Date(eatMs)
    const eatTime = `${eatNow.getUTCHours().toString().padStart(2,'0')}:${eatNow.getUTCMinutes().toString().padStart(2,'0')}:00`

    // Fetch open sessions with their timetable end_time
    const { data: openScans } = await admin
      .from('teacher_attendance_scans')
      .select('id, timetable_period_id, expected_end')
      .eq('school_id', auth.schoolId)
      .eq('scan_date', today)
      .in('status', ['present', 'late'])
      .is('lesson_completed_at', null)

    if (!openScans?.length) return NextResponse.json({ closed: 0 })

    const expired = openScans.filter((s) => {
      if (!s.expected_end) return false
      return s.expected_end <= eatTime
    })

    if (!expired.length) return NextResponse.json({ closed: 0 })

    const ids = expired.map((s) => s.id)
    const closedAt = now.toISOString()

    await admin
      .from('teacher_attendance_scans')
      .update({ lesson_completed_at: closedAt })
      .in('id', ids)

    return NextResponse.json({ closed: ids.length, type: 'auto' })
  }

  // QR checkout — teacher self-service
  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  let scanRecord: { id: string; expected_end: string | null } | null = null

  if (scan_id) {
    const { data } = await admin
      .from('teacher_attendance_scans')
      .select('id, expected_end')
      .eq('id', scan_id)
      .eq('teacher_id', staff.id)
      .eq('school_id', auth.schoolId)
      .in('status', ['present', 'late'])
      .is('lesson_completed_at', null)
      .maybeSingle()
    scanRecord = data
  } else {
    const { data } = await admin
      .from('teacher_attendance_scans')
      .select('id, expected_end')
      .eq('teacher_id', staff.id)
      .eq('school_id', auth.schoolId)
      .eq('scan_date', today)
      .in('status', ['present', 'late'])
      .is('lesson_completed_at', null)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    scanRecord = data
  }

  if (!scanRecord) {
    return NextResponse.json({ error: 'No open session to check out' }, { status: 404 })
  }

  const checkoutTime = now.toISOString()

  // Determine if leaving early
  let updatePayload: Record<string, unknown> = { lesson_completed_at: checkoutTime }

  if (scanRecord.expected_end) {
    const eatMs   = now.getTime() + 3 * 60 * 60 * 1000
    const eatNow  = new Date(eatMs)
    const eatTime = `${eatNow.getUTCHours().toString().padStart(2,'0')}:${eatNow.getUTCMinutes().toString().padStart(2,'0')}:00`

    if (eatTime < scanRecord.expected_end) {
      // Calculate how many minutes early
      const [eh, em] = scanRecord.expected_end.split(':').map(Number)
      const endMinutes = eh * 60 + em
      const [nh, nm]   = eatTime.split(':').map(Number)
      const nowMinutes = nh * 60 + nm
      const earlyMins  = endMinutes - nowMinutes

      updatePayload = {
        ...updatePayload,
        status:             'left_early',
        left_early_at:      checkoutTime,
        left_early_minutes: earlyMins,
      }
    }
  }

  const { error } = await admin
    .from('teacher_attendance_scans')
    .update(updatePayload)
    .eq('id', scanRecord.id)

  if (error) {
    console.error('[session/checkout] update error:', error)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, scan_id: scanRecord.id, type: 'qr', checkout_at: checkoutTime })
}

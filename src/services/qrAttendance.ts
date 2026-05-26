import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Current period resolver ───────────────────────────────────────
// Queries school_periods for whichever teaching period is active right now.

export async function getCurrentPeriod(schoolId: string): Promise<{
  period: {
    id: string
    period_number: number
    period_name: string | null
    start_time: string
    end_time: string
  } | null
  minutesElapsed: number
  isLateWindow: boolean  // > 10 min into period
  isPeriodOver: boolean
}> {
  const now   = new Date()
  const hhmm  = now.toTimeString().slice(0, 5)  // "HH:MM"

  const admin = getAdmin()
  const { data: period } = await admin
    .from('school_periods')
    .select('id, period_number, period_name, start_time, end_time')
    .eq('school_id', schoolId)
    .eq('is_teaching', true)
    .lte('start_time', hhmm)
    .gte('end_time',   hhmm)
    .order('period_number', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!period) {
    return { period: null, minutesElapsed: 0, isLateWindow: false, isPeriodOver: true }
  }

  const [sh, sm]    = period.start_time.split(':').map(Number)
  const [nh, nm]    = hhmm.split(':').map(Number)
  const minutesElapsed = (nh * 60 + nm) - (sh * 60 + sm)

  return {
    period,
    minutesElapsed,
    isLateWindow: minutesElapsed > 10,
    isPeriodOver: false,
  }
}

// ── Process QR scan ───────────────────────────────────────────────
// Hard constraints:
//   1. Student must exist with that qr_token
//   2. A teaching period must be active right now
//   3. A timetable_periods row must match teacher + student's class + period_number + day
//   4. No duplicate scan for same slot + student + today

export async function processQRScan(payload: {
  studentQRToken: string
  teacherId: string
  schoolId: string
  deviceInfo?: string
}): Promise<{
  success: boolean
  status: 'Present' | 'Late' | 'Invalid' | 'Duplicate'
  message: string
  studentName?: string
  className?: string
}> {
  const admin = getAdmin()

  // 1. Resolve student from QR token
  const { data: student } = await admin
    .from('students')
    .select('id, full_name, admission_number, class_name, class_id')
    .eq('school_id', payload.schoolId)
    .eq('qr_token', payload.studentQRToken)
    .maybeSingle()

  if (!student) {
    return { success: false, status: 'Invalid', message: 'Invalid QR code — student not found.' }
  }

  // 2. Get current teaching period
  const { period, minutesElapsed, isPeriodOver } = await getCurrentPeriod(payload.schoolId)

  if (!period || isPeriodOver) {
    return { success: false, status: 'Invalid', message: 'No active teaching period right now.' }
  }

  // 3. Find matching timetable slot — teacher + student's class + period_number + today's day
  const now       = new Date()
  // JS: 0=Sun,1=Mon...6=Sat; timetable_periods: 1=Mon...5=Fri
  const jsDay     = now.getDay()
  const dayOfWeek = jsDay === 0 ? 1 : jsDay === 6 ? 5 : jsDay

  const classIdentifier = student.class_id || student.class_name

  const { data: slot } = await admin
    .from('timetable_periods')
    .select('id, class_id, class_name, subject, school_id')
    .eq('school_id', payload.schoolId)
    .eq('teacher_id', payload.teacherId)
    .eq('day_of_week', dayOfWeek)
    .eq('period_number', period.period_number)
    .eq('is_active', true)
    .or(`class_id.eq.${classIdentifier},class_name.eq.${student.class_name}`)
    .maybeSingle()

  if (!slot) {
    return {
      success: false,
      status: 'Invalid',
      message: `No timetable entry for this teacher and class in ${period.period_name ?? `Period ${period.period_number}`} today. Cannot record attendance outside scheduled lessons.`,
    }
  }

  // 4. Check for duplicate
  const today = now.toISOString().slice(0, 10)
  const { data: existing } = await admin
    .from('student_qr_attendance')
    .select('id, scan_status')
    .eq('timetable_period_id', slot.id)
    .eq('student_id', student.id)
    .eq('scan_date', today)
    .maybeSingle()

  if (existing) {
    return {
      success: false,
      status: 'Duplicate',
      message: `${student.full_name} already marked ${existing.scan_status} for this lesson.`,
      studentName: student.full_name,
    }
  }

  // 5. Status: Late if > 10 min into period
  const scanStatus = minutesElapsed > 10 ? 'Late' : 'Present'

  // 6. Record attendance
  await admin.from('student_qr_attendance').insert({
    school_id:           payload.schoolId,
    timetable_period_id: slot.id,
    student_id:          student.id,
    teacher_id:          payload.teacherId,
    scanned_at:          now.toISOString(),
    scan_status:         scanStatus,
    device_info:         payload.deviceInfo ?? null,
  })

  // 7. Notify parent if late
  if (scanStatus === 'Late') {
    await admin.from('pwa_notifications').insert({
      school_id:  payload.schoolId,
      student_id: student.id,
      title:      '⚠ Late Arrival',
      message:    `${student.full_name} arrived late to ${slot.subject} (${minutesElapsed} minutes late).`,
      type:       'attendance',
    }).throwOnError().catch(() => {
      // pwa_notifications insert failure is non-fatal
    })
  }

  return {
    success: true,
    status:  scanStatus,
    message: scanStatus === 'Late'
      ? `${student.full_name} marked LATE (${minutesElapsed} min)`
      : `${student.full_name} marked PRESENT ✓`,
    studentName: student.full_name,
    className:   slot.class_name,
  }
}

// ── Auto-mark absentees ───────────────────────────────────────────
// Called by edge function at period end for each active slot.
// Inserts 'Absent' for every student in the class who was not scanned.

export async function autoMarkAbsent(
  timetablePeriodId: string,
  teacherId: string,
  schoolId: string
): Promise<{ marked: number }> {
  const admin = getAdmin()

  // Get slot details
  const { data: slot } = await admin
    .from('timetable_periods')
    .select('class_id, class_name')
    .eq('id', timetablePeriodId)
    .maybeSingle()

  if (!slot) return { marked: 0 }

  // All active students in this class
  const { data: allStudents } = await admin
    .from('students')
    .select('id, full_name')
    .eq('school_id', schoolId)
    .or(`class_id.eq.${slot.class_id},class_name.eq.${slot.class_name}`)
    .eq('is_active', true)

  if (!allStudents?.length) return { marked: 0 }

  const today = new Date().toISOString().slice(0, 10)

  // Students already scanned today for this slot
  const { data: scanned } = await admin
    .from('student_qr_attendance')
    .select('student_id')
    .eq('timetable_period_id', timetablePeriodId)
    .eq('scan_date', today)

  const scannedIds = new Set((scanned ?? []).map((r) => r.student_id))

  const absent = allStudents.filter((s) => !scannedIds.has(s.id))
  if (!absent.length) return { marked: 0 }

  const now = new Date().toISOString()

  await admin.from('student_qr_attendance').insert(
    absent.map((s) => ({
      school_id:           schoolId,
      timetable_period_id: timetablePeriodId,
      student_id:          s.id,
      teacher_id:          teacherId,
      scanned_at:          now,
      scan_status:         'Absent',
    }))
  )

  // Push absence alerts to parents (best-effort)
  for (const s of absent) {
    await admin.from('pwa_notifications').insert({
      school_id:  schoolId,
      student_id: s.id,
      title:      '⚠ Attendance Alert',
      message:    `${s.full_name} was marked absent. If unexpected, contact the school.`,
      type:       'attendance',
    }).throwOnError().catch(() => {})
  }

  return { marked: absent.length }
}

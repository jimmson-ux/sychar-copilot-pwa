'use server'

import { createClient } from '@supabase/supabase-js'
import { requireAuth }  from '@/lib/requireAuth'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── What is happening RIGHT NOW ───────────────────────────────────
export async function getTimetableCurrentSlot() {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const now   = new Date()
  const hhmm  = now.toTimeString().slice(0, 5)
  const jsDay = now.getDay()
  const dow   = jsDay === 0 ? 1 : jsDay === 6 ? 5 : jsDay

  const { data: period } = await admin
    .from('school_periods')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('is_teaching', true)
    .lte('start_time', hhmm)
    .gte('end_time',   hhmm)
    .order('period_number')
    .limit(1)
    .maybeSingle()

  if (!period) return { period: null, slots: [] }

  const { data: slots } = await admin
    .from('timetable_periods')
    .select(`
      id, class_id, class_name, subject, teacher_id, teacher_name,
      room, is_covered, covered_by_id,
      staff_records!teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('period_number', period.period_number)
    .eq('day_of_week', dow)
    .eq('is_active', true)

  return { period, slots: slots ?? [] }
}

// ── Teacher's full week view ──────────────────────────────────────
export async function getTeacherWeekTimetable(teacherId: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('timetable_periods')
    .select(`
      id, class_id, class_name, subject, day_of_week,
      period_number, start_time, end_time, room,
      is_covered, covered_by_id, cover_assigned_at
    `)
    .eq('school_id', auth.schoolId)
    .eq('teacher_id', teacherId)
    .eq('is_active', true)
    .order('day_of_week')
    .order('period_number')

  if (error) throw new Error('Failed to fetch timetable')

  const byDay: Record<number, typeof data> = {}
  for (const slot of data ?? []) {
    if (!byDay[slot.day_of_week]) byDay[slot.day_of_week] = []
    byDay[slot.day_of_week]!.push(slot)
  }
  return byDay
}

// ── Uncovered gaps today ──────────────────────────────────────────
export async function getTimetableGaps() {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin   = getAdmin()
  const today   = new Date().toISOString().slice(0, 10)
  const jsDay   = new Date().getDay()
  const dow     = jsDay === 0 ? 1 : jsDay === 6 ? 5 : jsDay

  const { data: absences } = await admin
    .from('teacher_absences')
    .select('teacher_id, absence_type, cover_status, staff_records!teacher_id(full_name)')
    .eq('school_id', auth.schoolId)
    .eq('absence_date', today)

  if (!absences?.length) return { gaps: [], absences: [] }

  const absentIds = absences.map((a: { teacher_id: string }) => a.teacher_id).filter(Boolean)

  const { data: gaps } = await admin
    .from('timetable_periods')
    .select('id, class_id, class_name, subject, teacher_id, teacher_name, period_number, start_time, room')
    .eq('school_id', auth.schoolId)
    .eq('day_of_week', dow)
    .eq('is_active', true)
    .eq('is_covered', false)
    .in('teacher_id', absentIds)

  return { gaps: gaps ?? [], absences }
}

// ── Report teacher absence ────────────────────────────────────────
export async function reportTeacherAbsence(payload: {
  teacherId:   string
  absenceDate: string
  absenceType: string
  notes?:      string
}) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('teacher_absences')
    .upsert({
      school_id:    auth.schoolId,
      teacher_id:   payload.teacherId,
      absence_date: payload.absenceDate,
      absence_type: payload.absenceType,
      reported_by:  auth.userId,
      notes:        payload.notes ?? null,
    }, { onConflict: 'school_id,teacher_id,absence_date' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

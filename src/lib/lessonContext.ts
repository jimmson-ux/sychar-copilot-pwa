// Lesson/timetable context helpers — used to detect whether a nurse visit happened
// during class hours (a defense for the teacher/student) and to surface absence
// reasons in the subject teacher's roll call.

import type { SupabaseClient } from '@supabase/supabase-js'

export function nowEAT(): Date {
  return new Date(Date.now() + 3 * 60 * 60 * 1000)
}

/** ISO day of week 1=Mon..7=Sun and HH:MM:SS, in EAT. */
export function eatDayAndTime(): { dow: number; time: string } {
  const d = nowEAT()
  const jsDow = d.getUTCDay()            // 0=Sun..6=Sat (we already shifted to EAT)
  const dow = jsDow === 0 ? 7 : jsDow    // ISO 1=Mon..7=Sun
  const time = d.toISOString().slice(11, 19)
  return { dow, time }
}

/** Is the school currently within a scheduled lesson period (any class)? */
export async function isClassHoursNow(svc: SupabaseClient, schoolId: string): Promise<boolean> {
  const { dow, time } = eatDayAndTime()
  const { data } = await svc
    .from('timetable_periods')
    .select('id')
    .eq('school_id', schoolId)
    .eq('day_of_week', dow)
    .eq('period_type', 'lesson')
    .lte('start_time', time)
    .gte('end_time', time)
    .limit(1)
  return !!(data && data.length)
}

export interface LessonSlot {
  period_id: string
  subject: string | null
  teacher_id: string | null
  class_name: string | null
  start_time: string | null
  end_time: string | null
}

/** The lesson a class is in right now (so a student's absence has a subject teacher to alert). */
export async function studentCurrentLesson(svc: SupabaseClient, schoolId: string, className: string): Promise<LessonSlot | null> {
  const { dow, time } = eatDayAndTime()
  const { data } = await svc
    .from('timetable_periods')
    .select('id, subject, teacher_id, class_name, start_time, end_time')
    .eq('school_id', schoolId)
    .eq('day_of_week', dow)
    .eq('class_name', className)
    .lte('start_time', time)
    .gte('end_time', time)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const r = data as any
  return { period_id: r.id, subject: r.subject, teacher_id: r.teacher_id, class_name: r.class_name, start_time: r.start_time, end_time: r.end_time }
}

/** Is a teacher scheduled to be teaching right now? (Defense if they visited the nurse.) */
export async function teacherCurrentLesson(svc: SupabaseClient, schoolId: string, teacherId: string): Promise<LessonSlot | null> {
  const { dow, time } = eatDayAndTime()
  const { data } = await svc
    .from('timetable_periods')
    .select('id, subject, teacher_id, class_name, start_time, end_time')
    .eq('school_id', schoolId)
    .eq('day_of_week', dow)
    .eq('teacher_id', teacherId)
    .lte('start_time', time)
    .gte('end_time', time)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const r = data as any
  return { period_id: r.id, subject: r.subject, teacher_id: r.teacher_id, class_name: r.class_name, start_time: r.start_time, end_time: r.end_time }
}

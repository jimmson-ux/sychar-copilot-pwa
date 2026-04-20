// GET /api/principal/staffing-intelligence
// Computes Metrics A–D: Load/Capacity, Ghost Subjects, Substitution Strain, Velocity vs Ratio

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const BURNOUT_THRESHOLD   = 28   // lessons/week
const KICD_LESSONS_PER_CLASS = 40 // standard lessons/week per class (KICD)

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'deputy', 'deputy_principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = svc()

  const [
    staffRes,
    classesRes,
    timetableRes,
    subjectRes,
    subsRes,
    syllabusRes,
  ] = await Promise.all([
    db.from('staff_records')
      .select('id, full_name, subject_specialization, max_lessons_per_week')
      .eq('school_id', auth.schoolId!)
      .eq('active', true)
      .in('role', ['teacher', 'deputy', 'deputy_principal']),

    db.from('students')
      .select('class_name')
      .eq('school_id', auth.schoolId!)
      .eq('status', 'active'),

    db.from('timetable_slots')
      .select('staff_id, subject_name, class_name, day_of_week')
      .eq('school_id', auth.schoolId!),

    db.from('school_subjects')
      .select('id, subject_name, required_specialization')
      .eq('school_id', auth.schoolId!),

    db.from('lesson_logs')
      .select('staff_id, type, scheduled_start')
      .eq('school_id', auth.schoolId!)
      .eq('type', 'substitution')
      .gte('scheduled_start', new Date(Date.now() - 28 * 86400000).toISOString()),  // last 4 weeks

    db.from('syllabus_progress')
      .select('staff_id, subject_name, velocity_score, class_name')
      .eq('school_id', auth.schoolId!),
  ])

  const staff      = (staffRes.data    ?? []) as { id: string; full_name: string; subject_specialization: string | null; max_lessons_per_week: number | null }[]
  const classes    = (classesRes.data  ?? []) as { class_name: string }[]
  const slots      = (timetableRes.data ?? []) as { staff_id: string; subject_name: string; class_name: string }[]
  const subjects   = (subjectRes.data  ?? []) as { id: string; subject_name: string; required_specialization: string | null }[]
  const subs       = (subsRes.data     ?? []) as { staff_id: string }[]
  const syllabus   = (syllabusRes.data ?? []) as { staff_id: string; subject_name: string; velocity_score: number; class_name: string }[]

  const uniqueClasses = [...new Set(classes.map(c => c.class_name))]

  // ── METRIC A: Load vs Capacity ───────────────────────────────────────────
  const lessonsRequired = uniqueClasses.length * KICD_LESSONS_PER_CLASS

  // Lessons per teacher per week (from timetable)
  const teacherLessons = new Map<string, number>()
  for (const slot of slots) {
    teacherLessons.set(slot.staff_id, (teacherLessons.get(slot.staff_id) ?? 0) + 1)
  }

  const totalCapacity  = [...teacherLessons.values()].reduce((a, b) => a + b, 0)
  const uncoveredLessons = Math.max(0, lessonsRequired - totalCapacity)

  const burnoutWarnings = staff
    .filter(s => (teacherLessons.get(s.id) ?? 0) > BURNOUT_THRESHOLD)
    .map(s => ({
      staff_id:   s.id,
      staff_name: s.full_name,
      lessons_per_week: teacherLessons.get(s.id) ?? 0,
      over_by:    (teacherLessons.get(s.id) ?? 0) - BURNOUT_THRESHOLD,
    }))

  const metricA = {
    lessons_required:   lessonsRequired,
    total_capacity:     totalCapacity,
    uncovered_lessons:  uncoveredLessons,
    coverage_pct:       lessonsRequired > 0 ? Math.round((totalCapacity / lessonsRequired) * 100) : 100,
    burnout_warnings:   burnoutWarnings,
    insight: uncoveredLessons > 0
      ? `${uncoveredLessons} lessons/week uncovered — consider hiring or redistributing load`
      : burnoutWarnings.length > 0
      ? `All lessons covered but ${burnoutWarnings.length} teacher(s) exceed burnout threshold`
      : 'Staffing load is balanced',
  }

  // ── METRIC B: Ghost Subject Alert ────────────────────────────────────────
  const ghostAlerts: { subject: string; severity: 'critical' | 'warning'; message: string }[] = []

  for (const subject of subjects) {
    // Find who teaches this subject
    const teachers = slots
      .filter(s => s.subject_name.toLowerCase() === subject.subject_name.toLowerCase())
      .map(s => s.staff_id)
    const uniqueTeachers = [...new Set(teachers)]

    if (uniqueTeachers.length === 0) {
      ghostAlerts.push({
        subject:  subject.subject_name,
        severity: 'critical',
        message:  `Critical Shortage — no teacher assigned for ${subject.subject_name}`,
      })
    } else if (subject.required_specialization) {
      // Check if any assigned teacher is out-of-field
      for (const tid of uniqueTeachers) {
        const t = staff.find(s => s.id === tid)
        if (t && t.subject_specialization && !t.subject_specialization.toLowerCase().includes(subject.required_specialization.toLowerCase())) {
          ghostAlerts.push({
            subject:  subject.subject_name,
            severity: 'warning',
            message:  `Out-of-field warning — ${t.full_name} teaching ${subject.subject_name} outside specialization (${t.subject_specialization})`,
          })
        }
      }
    }
  }

  const metricB = { ghost_alerts: ghostAlerts }

  // ── METRIC C: Substitution Strain Index ──────────────────────────────────
  const subsPerTeacher = new Map<string, number>()
  for (const s of subs) {
    subsPerTeacher.set(s.staff_id, (subsPerTeacher.get(s.staff_id) ?? 0) + 1)
  }

  const strainData = staff.map(s => {
    const ownLessons  = teacherLessons.get(s.id) ?? 0
    const subCount    = subsPerTeacher.get(s.id)  ?? 0
    const total       = ownLessons + subCount
    const strainIndex = total > 0 ? Math.round((subCount / total) * 100) : 0
    return { staff_id: s.id, staff_name: s.full_name, own_lessons: ownLessons, sub_count: subCount, strain_index: strainIndex }
  }).filter(s => s.sub_count > 0).sort((a, b) => b.strain_index - a.strain_index)

  const totalSubHours  = subs.length  // 1 sub = 1 lesson ≈ 40 min
  const avgLessonHours = 40 / 60      // hours per lesson
  const subsHoursPerWeek = Math.round((totalSubHours / 4) * avgLessonHours * 10) / 10 // 4-week window

  // Which subject has most subs? Compute hiring recommendation
  const subjectSubCount: Record<string, number> = {}
  for (const slot of slots) {
    // Find if slot was covered by sub (rough proxy: staff_id in subs)
    if (subsPerTeacher.has(slot.staff_id)) {
      subjectSubCount[slot.subject_name] = (subjectSubCount[slot.subject_name] ?? 0) + (subsPerTeacher.get(slot.staff_id) ?? 0)
    }
  }
  const topSubSubject = Object.entries(subjectSubCount).sort(([, a], [, b]) => b - a)[0]

  const metricC = {
    total_sub_hours_per_week: subsHoursPerWeek,
    strain_data: strainData.slice(0, 10),
    insight: topSubSubject
      ? `Hiring 1 ${topSubSubject[0]} teacher would reduce substitutions by ~${Math.round(topSubSubject[1] / 4)} lessons/week`
      : 'Substitution load is manageable',
  }

  // ── METRIC D: Syllabus Velocity vs Student:Teacher Ratio ─────────────────
  const deptVelocity: Record<string, { scores: number[]; classes: string[] }> = {}
  for (const sv of syllabus) {
    if (!deptVelocity[sv.subject_name]) deptVelocity[sv.subject_name] = { scores: [], classes: [] }
    deptVelocity[sv.subject_name].scores.push(sv.velocity_score)
    if (!deptVelocity[sv.subject_name].classes.includes(sv.class_name)) {
      deptVelocity[sv.subject_name].classes.push(sv.class_name)
    }
  }

  const velocityInsights: { subject: string; avg_velocity: number; class_count: number; student_count: number; insight: string }[] = []
  const totalStudents = classes.length

  for (const [subject, { scores, classes: affectedClasses }] of Object.entries(deptVelocity)) {
    const avgVelocity = scores.reduce((a, b) => a + b, 0) / scores.length
    if (avgVelocity < 71) { // behind schedule
      const approxStudents = Math.round((totalStudents / uniqueClasses.length) * affectedClasses.length)
      const teacherCount   = [...new Set(syllabus.filter(s => s.subject_name === subject).map(s => s.staff_id))].length
      const ratio          = teacherCount > 0 ? Math.round(approxStudents / teacherCount) : 0
      const gap            = Math.round(100 - avgVelocity)

      velocityInsights.push({
        subject,
        avg_velocity:  Math.round(avgVelocity),
        class_count:   affectedClasses.length,
        student_count: approxStudents,
        insight: ratio > 45
          ? `${subject} velocity gap (${gap}% behind) correlates with 1:${ratio} ratio — structural issue, not performance`
          : `${subject} velocity gap (${gap}% behind) — consider targeted support or workload review`,
      })
    }
  }

  const metricD = { velocity_insights: velocityInsights.sort((a, b) => a.avg_velocity - b.avg_velocity) }

  return NextResponse.json({
    metric_a: metricA,
    metric_b: metricB,
    metric_c: metricC,
    metric_d: metricD,
    computed_at: new Date().toISOString(),
  })
}

// GET /api/teacher/overview
// Returns everything the teacher dashboard needs in one request.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const TEACHER_ROLES = new Set([
  'class_teacher', 'subject_teacher', 'bom_teacher',
  'hod_sciences', 'hod_mathematics', 'hod_languages',
  'hod_humanities', 'hod_applied_sciences',
])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { userId, schoolId, subRole } = auth

  // Resolve staff record
  const { data: staff } = await db
    .from('staff_records')
    .select('id, full_name, sub_role, department, class_name, teacher_initials, reliability_index, compliance_score, tsc_number, photo_url')
    .eq('user_id', userId!)
    .eq('school_id', schoolId!)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  const staffId   = staff.id as string
  const className = staff.class_name as string | null

  const today     = new Date().toISOString().split('T')[0]
  const dayName   = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  // Parallel fetches
  const [
    todayTimetableRes,
    attendanceTodayRes,
    classStudentsRes,
    recentSessionsRes,
    velocityRes,
    masteryRes,
    rulesRes,
    pendingAttendanceDaysRes,
  ] = await Promise.all([
    // Today's timetable for this teacher
    db.from('timetable')
      .select('id, class_name, subject, subject_code, period, period_number, start_time, end_time, room')
      .eq('school_id', schoolId!)
      .eq('teacher_id', staffId)
      .eq('day', dayName)
      .eq('is_active', true)
      .order('period_number'),

    // Today's attendance already submitted
    db.from('attendance_records')
      .select('period, class_name')
      .eq('school_id', schoolId!)
      .eq('teacher_id', staffId)
      .eq('date', today),

    // Class students (if class teacher)
    className
      ? db.from('students')
          .select('id, full_name, admission_number, stream, photo_url')
          .eq('school_id', schoolId!)
          .eq('class_name', className)
          .eq('is_active', true)
          .order('full_name')
      : Promise.resolve({ data: [], error: null }),

    // Recent lesson sessions (last 14 days)
    db.from('lesson_sessions')
      .select('id, class_name, subject, date, period, topic_covered, micro_score, check_in_confirmed')
      .eq('school_id', schoolId!)
      .eq('teacher_id', staffId)
      .gte('date', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(20),

    // Syllabus velocity: schemes of work targets
    db.from('schemes_of_work')
      .select('id, subject, class_name, total_topics, topics_covered, week_number')
      .eq('school_id', schoolId!)
      .eq('teacher_id', staffId)
      .order('week_number', { ascending: false })
      .limit(5),

    // Topic mastery heatmap
    db.from('topic_mastery')
      .select('topic, subject, class_name, mastery_level, assessed_at')
      .eq('school_id', schoolId!)
      .eq('teacher_id', staffId)
      .order('assessed_at', { ascending: false })
      .limit(40),

    // School discipline rules
    db.from('school_rules')
      .select('id, category, rule_text, severity')
      .eq('school_id', schoolId!)
      .eq('is_active', true)
      .order('severity', { ascending: false }),

    // Days with missing attendance in last 7 days
    db.from('attendance_records')
      .select('date, period')
      .eq('school_id', schoolId!)
      .eq('teacher_id', staffId)
      .gte('date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]),
  ])

  const timetable         = todayTimetableRes.data ?? []
  const attendanceToday   = attendanceTodayRes.data ?? []
  const classStudents     = classStudentsRes.data ?? []
  const recentSessions    = recentSessionsRes.data ?? []
  const schemes           = velocityRes.data ?? []
  const mastery           = masteryRes.data ?? []
  const rules             = rulesRes.data ?? []
  const attendedPeriods   = new Set((attendanceToday).map((r: { period: number | null }) => r.period))

  // At-risk: check performance data if subject teacher
  let atRisk: unknown[] = []
  if (recentSessions.length > 0) {
    const classNames = [...new Set(recentSessions.map((s: { class_name: string }) => s.class_name))]
    const { data: examData } = await db
      .from('exam_results')
      .select('student_id, student_name, subject, score, exam_date, class_name')
      .eq('school_id', schoolId!)
      .in('class_name', classNames)
      .order('exam_date', { ascending: false })
      .limit(100)

    // Group by student + subject, flag if latest score < 40 or declining 3+ consecutive
    type ExamRow = { student_id: string; student_name: string; subject: string; score: number; exam_date: string; class_name: string }
    const byStudent: Record<string, ExamRow[]> = {}
    for (const row of (examData ?? []) as ExamRow[]) {
      const key = `${row.student_id}|${row.subject}`
      if (!byStudent[key]) byStudent[key] = []
      byStudent[key].push(row)
    }
    atRisk = Object.values(byStudent)
      .filter(rows => {
        if (rows.length === 0) return false
        const latest = rows[0].score
        if (latest < 40) return true
        if (rows.length >= 3) {
          const declining = rows[0].score < rows[1].score && rows[1].score < rows[2].score
          if (declining) return true
        }
        return false
      })
      .map(rows => ({
        student_id:   rows[0].student_id,
        student_name: rows[0].student_name,
        subject:      rows[0].subject,
        class_name:   rows[0].class_name,
        latest_score: rows[0].score,
        trend:        rows.slice(0, 5).map((r: ExamRow) => r.score),
      }))
      .slice(0, 10)
  }

  // Compute velocity per scheme
  type SchemeRow = { id: string; subject: string; class_name: string; total_topics: number | null; topics_covered: number | null; week_number: number | null }
  const velocity = (schemes as SchemeRow[]).map(s => ({
    ...s,
    velocity_pct: s.total_topics && s.topics_covered != null
      ? Math.round((s.topics_covered / s.total_topics) * 100)
      : null,
    expected_pct: s.week_number
      ? Math.round((s.week_number / 14) * 100)  // 14-week term assumption
      : null,
  }))

  // Pending periods for today (timetable periods not yet submitted)
  const pendingPeriods = timetable.filter((t: { period_number: number | null }) => !attendedPeriods.has(t.period_number))

  return NextResponse.json({
    staff,
    sub_role:         subRole,
    today,
    timetable,
    pending_periods:  pendingPeriods,
    class_students:   classStudents,
    recent_sessions:  recentSessions,
    schemes:          velocity,
    mastery,
    at_risk:          atRisk,
    rules,
    compliance_score: staff.reliability_index ?? 0,
  })
}

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

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { userId, schoolId, subRole } = auth

  // Resolve staff record — use assigned_class (not class_name which doesn't exist on staff_records)
  const { data: staff } = await db
    .from('staff_records')
    .select('id, full_name, sub_role, department, assigned_class, teacher_initials, reliability_index, compliance_score, tsc_number, photo_url')
    .eq('user_id', userId!)
    .eq('school_id', schoolId!)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  const staffId   = (staff as { id: string }).id
  const className = (staff as { assigned_class: string | null }).assigned_class ?? null

  const today   = new Date().toISOString().split('T')[0]
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  type StaffRow = {
    id: string; full_name: string; sub_role: string; department: string | null
    assigned_class: string | null; teacher_initials: string | null
    reliability_index: number | null; compliance_score: number | null
    tsc_number: string | null; photo_url: string | null
  }

  // Parallel fetches
  const [
    todayTimetableRes,
    attendanceTodayRes,
    classStudentsRes,
    recentSessionsRes,
    velocityRes,
    masteryRes,
    rulesRes,
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

    // Class students (if class teacher — matched by class_name text)
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

    // Syllabus velocity from schemes_of_work_new (correct table name)
    db.from('schemes_of_work_new')
      .select('id, subject_name, class_name, term, weeks_per_term, lessons_per_week, weekly_plan, status')
      .eq('school_id', schoolId!)
      .eq('teacher_id', staffId)
      .order('term', { ascending: false })
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
  ])

  const timetable       = todayTimetableRes.data ?? []
  const attendanceToday = attendanceTodayRes.data ?? []
  const classStudents   = classStudentsRes.data ?? []
  const recentSessions  = recentSessionsRes.data ?? []
  const rawSchemes      = velocityRes.data ?? []
  const mastery         = masteryRes.data ?? []
  const rules           = rulesRes.data ?? []
  const attendedPeriods = new Set(attendanceToday.map((r: { period: number | null }) => r.period))

  // Velocity from schemes_of_work_new — weekly_plan JSON array drives progress
  type SowRow = {
    id: string; subject_name: string; class_name: string
    term: number | null; weeks_per_term: number | null; lessons_per_week: number | null
    weekly_plan: unknown; status: string | null
  }
  const schemes = (rawSchemes as SowRow[]).map(s => {
    const totalTopics   = (s.weeks_per_term ?? 13) * (s.lessons_per_week ?? 5)
    const planArr       = Array.isArray(s.weekly_plan) ? s.weekly_plan : []
    const topicsCovered = planArr.length
    return {
      id:             s.id,
      subject:        s.subject_name,
      class_name:     s.class_name,
      week_number:    s.term,
      total_topics:   totalTopics,
      topics_covered: topicsCovered,
      velocity_pct:   totalTopics > 0 ? Math.round((topicsCovered / totalTopics) * 100) : 0,
      expected_pct:   s.term ? Math.round((s.term / 3) * 100) : null,
    }
  })

  // At-risk: query marks table (correct table) for students in teacher's classes
  let atRisk: unknown[] = []
  const classNames = className
    ? [className]
    : [...new Set((recentSessions as { class_name: string }[]).map(s => s.class_name))]

  if (classNames.length > 0 || classStudents.length > 0) {
    // Get student IDs either from already-fetched class students or from class_name lookup
    let studentIds: string[] = (classStudents as { id: string }[]).map(s => s.id)

    if (studentIds.length === 0 && classNames.length > 0) {
      const { data: extraStudents } = await db
        .from('students')
        .select('id')
        .eq('school_id', schoolId!)
        .in('class_name', classNames)
      studentIds = (extraStudents ?? []).map((s: { id: string }) => s.id)
    }

    if (studentIds.length > 0) {
      const { data: marksData } = await db
        .from('marks')
        .select('student_id, student_name, percentage, created_at, class_id')
        .eq('school_id', schoolId!)
        .in('student_id', studentIds)
        .not('percentage', 'is', null)
        .order('created_at', { ascending: false })
        .limit(300)

      type MarkRow = {
        student_id: string; student_name: string | null
        percentage: number; created_at: string; class_id: string | null
      }
      const byStudent: Record<string, MarkRow[]> = {}
      for (const row of (marksData ?? []) as MarkRow[]) {
        if (!byStudent[row.student_id]) byStudent[row.student_id] = []
        byStudent[row.student_id].push(row)
      }

      atRisk = Object.values(byStudent)
        .filter(rows => {
          if (rows.length === 0) return false
          const latest = rows[0].percentage
          if (latest < 40) return true
          if (rows.length >= 3) return rows[0].percentage < rows[1].percentage && rows[1].percentage < rows[2].percentage
          return false
        })
        .map(rows => {
          const s = (classStudents as { id: string; full_name: string }[]).find(st => st.id === rows[0].student_id)
          return {
            student_id:   rows[0].student_id,
            student_name: s?.full_name ?? rows[0].student_name ?? '—',
            subject:      '—',
            class_name:   className ?? classNames[0] ?? '—',
            latest_score: rows[0].percentage,
            trend:        rows.slice(0, 5).map(r => r.percentage),
          }
        })
        .slice(0, 10)
    }
  }

  // Pending periods: timetable periods not yet submitted today
  const pendingPeriods = timetable.filter(
    (t: { period_number: number | null }) => !attendedPeriods.has(t.period_number)
  )

  const staffRow = staff as StaffRow
  return NextResponse.json({
    staff: {
      ...staffRow,
      class_name: staffRow.assigned_class,  // expose as class_name for UI compatibility
    },
    sub_role:         subRole,
    today,
    timetable,
    pending_periods:  pendingPeriods,
    class_students:   classStudents,
    recent_sessions:  recentSessions,
    schemes,
    mastery,
    at_risk:          atRisk,
    rules,
    compliance_score: staffRow.compliance_score ?? staffRow.reliability_index ?? 0,
  })
}

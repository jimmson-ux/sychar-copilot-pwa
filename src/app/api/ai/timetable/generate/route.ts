import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/timetable/generate
 *
 * AI-assisted timetable generation for Deputy Principal / Dean.
 *
 * Intelligence sources fed to the AI:
 *   1. Teacher attendance stats — punctuality %, avg late minutes, absent rate
 *   2. Subject performance — student scores per teacher×subject×class
 *   3. Appraisal scores — punctuality, incident handling, student welfare ratings
 *   4. Existing workload — lesson counts to balance the schedule
 *
 * Rules enforced by AI:
 *   - Reliable teachers (high punctuality %) placed in critical early-morning slots
 *   - Best-performing teachers matched to their strongest subject-class combos
 *   - No teacher teaches two classes simultaneously
 *   - Duty periods use high incident_handling + student_welfare appraisal scorers
 *   - Balanced load: ≤ 4 lessons per teacher per day
 *
 * Body: { class_ids, subject_teachers, breaks, school_day_start, school_day_end,
 *         lesson_duration, days_per_week, term?, academic_year? }
 */

const DEPUTY_ROLES = new Set([
  'deputy_principal', 'deputy_principal_academic', 'dean_of_studies',
])

// ── Zod schema ──────────────────────────────────────────────────────────────
const PeriodSchema = z.object({
  class_id:      z.string(),
  class_name:    z.string(),
  subject:       z.string(),
  teacher_id:    z.string(),
  teacher_name:  z.string(),
  day_of_week:   z.number().int().min(1).max(5),
  period_number: z.number().int().min(1),
  start_time:    z.string().regex(/^\d{2}:\d{2}$/),
  end_time:      z.string().regex(/^\d{2}:\d{2}$/),
  period_type:   z.enum(['lesson', 'break', 'assembly', 'duty', 'free']),
  is_double:     z.boolean(),
  room:          z.string().optional(),
})

const TimetableSchema = z.object({
  periods:  z.array(PeriodSchema),
  warnings: z.array(z.string()),
})

type AttendanceStat = {
  teacher_id: string; teacher_name: string
  total_lessons: number; on_time: number
  late_count: number; absent_count: number; left_early_count: number
  avg_late_minutes: number | null; punctuality_pct: number | null
}

type SubjectPerf = {
  teacher_id: string; teacher_name: string
  subject_name: string; class_name: string
  avg_score: number | null; avg_pct: number | null; record_count: number
}

type AppraisalScore = {
  teacher_id: string; teacher_name: string
  avg_punctuality: number | null; avg_incident_handling: number | null
  avg_report_quality: number | null; avg_student_welfare: number | null
  appraisal_count: number
}

type WorkloadRow = { teacher_id: string; teacher_name: string; lesson_count: number }

// ── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(
  body: {
    class_ids: string[]
    subject_teachers: { subject: string; teacher_id: string; teacher_name: string; classes: string[] }[]
    breaks: { name: string; start_time: string; end_time: string }[]
    school_day_start: string
    school_day_end: string
    lesson_duration: number
    days_per_week: number
  },
  workload:     WorkloadRow[],
  attendance:   AttendanceStat[],
  performance:  SubjectPerf[],
  appraisals:   AppraisalScore[],
): string {
  // ─── Attendance reliability block ───
  const attendanceBlock = attendance.length > 0
    ? attendance.map(a => {
        const pct = a.punctuality_pct != null ? `${a.punctuality_pct}%` : 'no data'
        const late = a.late_count > 0 ? `, avg ${a.avg_late_minutes ?? '?'} min late` : ''
        const absent = a.absent_count > 0 ? `, absent ${a.absent_count}×` : ''
        const early = a.left_early_count > 0 ? `, left early ${a.left_early_count}×` : ''
        return `  • ${a.teacher_name}: on-time ${pct} (${a.total_lessons} lessons${late}${absent}${early})`
      }).join('\n')
    : '  • No attendance history yet — treat all teachers as equally reliable'

  // ─── Subject performance block ───
  const perfByTeacher = new Map<string, SubjectPerf[]>()
  performance.forEach(p => {
    const key = `${p.teacher_id}|${p.teacher_name}`
    if (!perfByTeacher.has(key)) perfByTeacher.set(key, [])
    perfByTeacher.get(key)!.push(p)
  })
  const performanceBlock = perfByTeacher.size > 0
    ? Array.from(perfByTeacher.entries()).map(([key, rows]) => {
        const name = key.split('|')[1]
        const subjects = rows.map(r => {
          const pct = r.avg_pct != null ? `${r.avg_pct}%` : 'N/A'
          return `${r.subject_name}/${r.class_name}: ${pct} avg (n=${r.record_count})`
        }).join(', ')
        return `  • ${name}: ${subjects}`
      }).join('\n')
    : '  • No exam data yet — use subject assignments as given'

  // ─── Appraisal block ───
  const appraisalBlock = appraisals.length > 0
    ? appraisals.map(a => {
        const punct = a.avg_punctuality != null ? `punct=${a.avg_punctuality}` : ''
        const incident = a.avg_incident_handling != null ? `incident=${a.avg_incident_handling}` : ''
        const welfare = a.avg_student_welfare != null ? `welfare=${a.avg_student_welfare}` : ''
        return `  • ${a.teacher_name}: ${[punct, incident, welfare].filter(Boolean).join(', ')} (${a.appraisal_count} appraisals)`
      }).join('\n')
    : '  • No appraisal data yet'

  // ─── Workload block ───
  const workloadBlock = workload.length > 0
    ? workload.map(w => `  • ${w.teacher_name}: ${w.lesson_count} periods already scheduled`).join('\n')
    : '  • No existing periods — scheduling from scratch'

  // ─── Subject-teacher assignments ───
  const assignmentsBlock = body.subject_teachers
    .map(st => `  • ${st.teacher_name} (id:${st.teacher_id}): ${st.subject} → [${st.classes.join(', ')}]`)
    .join('\n')

  // ─── Break slots ───
  const breaksBlock = body.breaks.length > 0
    ? body.breaks.map(b => `  • ${b.name}: ${b.start_time}–${b.end_time}`).join('\n')
    : '  • No fixed breaks specified'

  return `You are an expert school timetabling AI for Nkoroi Senior School (Kenya CBC/KCSE curriculum).
Generate a complete, intelligent weekly timetable for ${body.days_per_week} school days.

SCHOOL PARAMETERS
School day: ${body.school_day_start}–${body.school_day_end}
Lesson duration: ${body.lesson_duration} minutes
Classes to schedule: ${body.class_ids.join(', ')}

FIXED BREAKS (do not schedule lessons here):
${breaksBlock}

SUBJECT–TEACHER ASSIGNMENTS:
${assignmentsBlock}

TEACHER ATTENDANCE RELIABILITY (last 90 days):
${attendanceBlock}

STUDENT PERFORMANCE BY TEACHER×SUBJECT (higher % = teacher gets better results):
${performanceBlock}

TEACHER APPRAISAL SCORES (scale 1–5):
${appraisalBlock}

CURRENT WORKLOAD:
${workloadBlock}

TIMETABLING RULES — follow strictly:
1. No teacher teaches two classes in the same period on the same day.
2. Limit to 4 lessons per teacher per day for work–life balance.
3. Place HIGHEST punctuality teachers (>= 90% on-time) in Period 1 (first lesson of the day) — students need reliable teachers for morning lessons.
4. Where a teacher has proven results in a specific subject-class combination (high avg_pct), prioritise that assignment over a weaker performer for that class.
5. Insert ONE 'duty' period per school day (period_type = 'duty') for the teacher with the highest COMBINED (incident_handling + student_welfare) appraisal score — this is playground/gate supervision. Duty time coincides with the main break.
6. If two teachers have identical appraisal scores, give duty to the one with FEWER lessons that day.
7. Mark back-to-back same-subject periods for the same class as is_double = true.
8. Teachers with frequent absences (absent_count >= 3) should NOT be given Period 1 on Monday.
9. start_time and end_time must be HH:MM 24-hour format.
10. period_number is sequential per class per day starting from 1.
11. Add a 'warnings' array for any conflicts you cannot resolve.

Generate the FULL timetable covering ALL classes for ALL ${body.days_per_week} days.`
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!DEPUTY_ROLES.has(auth.subRole)) {
    return NextResponse.json(
      { error: 'Only Deputy Principal or Dean of Studies can generate timetables' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.class_ids) || !Array.isArray(body.subject_teachers)) {
    return NextResponse.json({ error: 'class_ids and subject_teachers are required' }, { status: 400 })
  }

  const {
    class_ids,
    subject_teachers,
    breaks            = [],
    school_day_start  = '07:30',
    school_day_end    = '17:00',
    lesson_duration   = 40,
    days_per_week     = 5,
    term,
    academic_year,
  } = body as {
    class_ids:        string[]
    subject_teachers: { subject: string; teacher_id: string; teacher_name: string; classes: string[] }[]
    breaks:           { name: string; start_time: string; end_time: string }[]
    school_day_start: string
    school_day_end:   string
    lesson_duration:  number
    days_per_week:    number
    term?:            string
    academic_year?:   string
  }

  const svc = createAdminSupabaseClient()

  // ── Fetch all intelligence sources in parallel ─────────────────
  const [
    { data: workloadRows },
    { data: attendanceRows },
    { data: performanceRows },
    { data: appraisalRows },
  ] = await Promise.all([
    svc.rpc('get_teacher_workload_summary',     { p_school_id: auth.schoolId }),
    svc.rpc('get_teacher_attendance_stats',     { p_school_id: auth.schoolId, p_days_back: 90 }),
    svc.rpc('get_teacher_subject_performance',  {
      p_school_id:     auth.schoolId,
      p_term:          term          ?? null,
      p_academic_year: academic_year ?? null,
    }),
    svc.rpc('get_teacher_appraisal_scores',    { p_school_id: auth.schoolId }),
  ])

  const prompt = buildPrompt(
    { class_ids, subject_teachers, breaks, school_day_start, school_day_end, lesson_duration, days_per_week },
    (workloadRows  ?? []) as WorkloadRow[],
    (attendanceRows ?? []) as AttendanceStat[],
    (performanceRows ?? []) as SubjectPerf[],
    (appraisalRows ?? []) as AppraisalScore[],
  )

  // ── AI generation: Claude Opus → Gemini fallback ───────────────
  let result: z.infer<typeof TimetableSchema>

  try {
    const { object } = await generateObject({
      model:     anthropic('claude-opus-4.7'),
      prompt,
      schema:    TimetableSchema,
      maxTokens: 8000,
    })
    result = object as z.infer<typeof TimetableSchema>
  } catch {
    try {
      const { object } = await generateObject({
        model:     google('gemini-2.0-flash'),
        prompt,
        schema:    TimetableSchema,
        maxTokens: 8000,
      })
      result = object as z.infer<typeof TimetableSchema>
    } catch (err) {
      console.error('[timetable/generate] AI failed', err)
      return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 502 })
    }
  }

  // ── Persist to timetable_periods ───────────────────────────────
  if (result.periods.length > 0) {
    const rows = result.periods.map(p => ({
      school_id:     auth.schoolId,
      class_id:      p.class_id,
      class_name:    p.class_name,
      subject:       p.subject,
      teacher_id:    p.teacher_id,
      teacher_name:  p.teacher_name,
      day_of_week:   p.day_of_week,
      period_number: p.period_number,
      start_time:    p.start_time,
      end_time:      p.end_time,
      period_type:   p.period_type,
      is_double:     p.is_double,
      room:          p.room ?? null,
      ai_generated:  true,
      is_active:     true,
    }))

    const { error: upsertErr } = await svc
      .from('timetable_periods')
      .upsert(rows, { onConflict: 'school_id,class_id,day_of_week,period_number' })

    if (upsertErr) {
      console.error('[timetable/generate] persist error', upsertErr)
      return NextResponse.json({ ...result, persist_error: upsertErr.message })
    }
  }

  return NextResponse.json({
    periods:      result.periods,
    warnings:     result.warnings,
    period_count: result.periods.length,
    persisted:    true,
    intelligence: {
      attendance_records:   (attendanceRows ?? []).length,
      performance_records:  (performanceRows ?? []).length,
      appraisal_records:    (appraisalRows  ?? []).length,
    },
  })
}

// GET — current timetable for the school
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const canView = DEPUTY_ROLES.has(auth.subRole) ||
    ['principal', 'super_admin', 'teacher'].includes(auth.subRole)

  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createAdminSupabaseClient()
  const { data, error } = await svc
    .from('timetable_periods')
    .select(
      'id, class_id, class_name, subject, teacher_id, teacher_name, ' +
      'day_of_week, period_number, start_time, end_time, period_type, is_double, room, is_active',
    )
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)
    .order('class_id')
    .order('day_of_week')
    .order('period_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ periods: data ?? [] })
}

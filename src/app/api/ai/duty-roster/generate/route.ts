import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/duty-roster/generate
 *
 * AI-generated weekly duty roster for Nkoroi Senior School.
 *
 * Intelligence sources:
 *   1. Appraisal scores — incident_handling + student_welfare → best duty candidates
 *   2. Attendance stats — avoid assigning duty to chronically late/absent teachers
 *   3. Current timetable — duty must NOT clash with a teacher's teaching period
 *   4. Workload — balance duty across all eligible staff
 *
 * Duty types: break_supervision, gate_duty, library, morning_assembly, exam_invigilation
 *
 * Body:
 *   {
 *     week_start:   string   — ISO date of the Monday that starts the target week
 *     duty_slots:   DutySlotSpec[]
 *     teacher_ids:  string[] — staff eligible for duty (omit for all active staff)
 *   }
 *
 * Returns: { assignments, warnings, rationale, persisted }
 */

const DEPUTY_ROLES = new Set([
  'deputy_principal', 'deputy_principal_academic', 'dean_of_studies',
])

// ── Zod schema ───────────────────────────────────────────────────────────────
const DutyAssignmentSchema = z.object({
  teacher_id:   z.string(),
  teacher_name: z.string(),
  duty_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_of_week:  z.number().int().min(1).max(5),
  duty_type:    z.enum([
    'break_supervision', 'gate_duty', 'library',
    'morning_assembly', 'exam_invigilation',
  ]),
  shift_start:  z.string().regex(/^\d{2}:\d{2}$/),
  shift_end:    z.string().regex(/^\d{2}:\d{2}$/),
  location:     z.string().optional(),
  notes:        z.string().optional(),
})

const DutyRosterSchema = z.object({
  assignments: z.array(DutyAssignmentSchema),
  warnings:    z.array(z.string()),
  rationale:   z.string(),
})

type AppraisalScore = {
  teacher_id: string; teacher_name: string
  avg_punctuality: number | null; avg_incident_handling: number | null
  avg_report_quality: number | null; avg_student_welfare: number | null
  appraisal_count: number
}

type AttendanceStat = {
  teacher_id: string; teacher_name: string
  total_lessons: number; on_time: number
  late_count: number; absent_count: number; left_early_count: number
  avg_late_minutes: number | null; punctuality_pct: number | null
}

type TimetablePeriod = {
  teacher_id: string; teacher_name: string
  day_of_week: number; start_time: string; end_time: string
  class_name: string; subject: string
}

type DutySlotSpec = {
  duty_type:  string
  start_time: string
  end_time:   string
  location?:  string
  days:       number[]  // e.g. [1,2,3,4,5] for every day
  count:      number    // teachers needed per day for this slot
}

// ── ISO week → array of YYYY-MM-DD dates ─────────────────────────────────────
function weekDates(weekStart: string): string[] {
  const base = new Date(weekStart)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

// ── Build prompt ──────────────────────────────────────────────────────────────
function buildDutyPrompt(
  weekStart:   string,
  dates:       string[],
  slots:       DutySlotSpec[],
  appraisals:  AppraisalScore[],
  attendance:  AttendanceStat[],
  timetable:   TimetablePeriod[],
  eligibleIds: string[],
): string {
  // ─── Appraisal rankings ───
  const appraisalBlock = appraisals.length > 0
    ? appraisals
        .filter(a => eligibleIds.length === 0 || eligibleIds.includes(a.teacher_id))
        .map(a => {
          const inc  = a.avg_incident_handling != null ? `incident=${a.avg_incident_handling}` : ''
          const welf = a.avg_student_welfare   != null ? `welfare=${a.avg_student_welfare}`    : ''
          const punc = a.avg_punctuality       != null ? `punct=${a.avg_punctuality}`           : ''
          return `  • ${a.teacher_name} (id:${a.teacher_id}): ${[punc, inc, welf].filter(Boolean).join(', ')}`
        }).join('\n')
    : '  • No appraisal data — assign duty equally'

  // ─── Attendance reliability ───
  const attendanceBlock = attendance.length > 0
    ? attendance
        .filter(a => eligibleIds.length === 0 || eligibleIds.includes(a.teacher_id))
        .map(a => {
          const pct  = a.punctuality_pct != null ? `${a.punctuality_pct}% on-time` : 'no data'
          const miss = a.absent_count > 0 ? `, absent ${a.absent_count}×` : ''
          return `  • ${a.teacher_name}: ${pct}${miss}`
        }).join('\n')
    : '  • No attendance history — treat all as equally available'

  // ─── Teaching clashes per teacher per day ───
  const clashMap: Record<string, string[]> = {}
  timetable.forEach(p => {
    const key = `${p.teacher_id}|${p.day_of_week}`
    if (!clashMap[key]) clashMap[key] = []
    clashMap[key].push(`${p.start_time}–${p.end_time} (${p.class_name} ${p.subject})`)
  })
  const clashBlock = Object.entries(clashMap).length > 0
    ? Object.entries(clashMap).map(([key, times]) => {
        const [tid, dow] = key.split('|')
        const name = appraisals.find(a => a.teacher_id === tid)?.teacher_name
          ?? attendance.find(a => a.teacher_id === tid)?.teacher_name
          ?? tid
        const dayName = ['Mon','Tue','Wed','Thu','Fri'][parseInt(dow) - 1]
        return `  • ${name} on ${dayName}: busy ${times.join(', ')}`
      }).join('\n')
    : '  • No existing timetable — no clashes to avoid'

  // ─── Duty slots needed ───
  const slotsBlock = slots.map(s => {
    const dayNames = s.days.map(d => ['Mon','Tue','Wed','Thu','Fri'][d - 1]).join('/')
    return `  • ${s.duty_type}: ${s.start_time}–${s.end_time}, location: ${s.location ?? 'TBD'}, ` +
           `days: ${dayNames}, teachers needed: ${s.count}`
  }).join('\n')

  const datesBlock = dates.map((d, i) =>
    `  • ${['Monday','Tuesday','Wednesday','Thursday','Friday'][i]}: ${d}`
  ).join('\n')

  return `You are an expert school duty roster planner for Nkoroi Senior School (Kenya).
Generate a COMPLETE weekly duty roster for the week of ${weekStart}.

WEEK DATES:
${datesBlock}

DUTY SLOTS REQUIRED (fill ALL of these):
${slotsBlock}

TEACHER APPRAISAL SCORES (scale 1–5; higher incident_handling + welfare = better duty officer):
${appraisalBlock}

TEACHER ATTENDANCE RELIABILITY:
${attendanceBlock}

EXISTING TEACHING CLASHES (do NOT assign duty when teacher is already teaching):
${clashBlock}

DUTY ASSIGNMENT RULES — apply strictly:
1. Primary criterion: highest (incident_handling + student_welfare) sum gets morning_assembly and break_supervision.
2. gate_duty: assign teachers with punctuality >= 90% — they must be present before students.
3. library duty: assign teachers with high report_quality scores (they are thorough and organised).
4. NEVER assign duty during a teacher's scheduled teaching period — check clash table carefully.
5. Absent-prone teachers (absent_count >= 3 in attendance data) must NOT have gate_duty on Monday morning.
6. Spread duty FAIRLY across the week — no teacher should have more than 2 duty slots in the same week.
7. If two teachers are equally scored, prefer the one with fewer teaching periods that day.
8. duty_date must match the exact calendar date for that day_of_week in this week.
9. Add a concise 'rationale' string (2–3 sentences) explaining the key allocation decisions.
10. Add 'warnings' for any slots you cannot fill without a clash.

Fill every duty slot listed above for every applicable day. Return the full roster.`
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!DEPUTY_ROLES.has(auth.subRole)) {
    return NextResponse.json(
      { error: 'Only Deputy Principal or Dean of Studies can generate the duty roster' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body?.week_start || !Array.isArray(body.duty_slots)) {
    return NextResponse.json(
      { error: 'week_start (YYYY-MM-DD Monday) and duty_slots[] are required' },
      { status: 400 },
    )
  }

  const {
    week_start,
    duty_slots,
    teacher_ids = [],
  } = body as {
    week_start:  string
    duty_slots:  DutySlotSpec[]
    teacher_ids: string[]
  }

  // Validate week_start is a Monday
  const wsDate = new Date(week_start)
  if (wsDate.getDay() !== 1) {
    return NextResponse.json({ error: 'week_start must be a Monday (day 1)' }, { status: 400 })
  }

  const dates = weekDates(week_start)
  const svc   = createAdminSupabaseClient()

  // ── Fetch all intelligence sources in parallel ──────────────────
  const [
    { data: appraisalRows },
    { data: attendanceRows },
    { data: timetableRows },
  ] = await Promise.all([
    svc.rpc('get_teacher_appraisal_scores',  { p_school_id: auth.schoolId }),
    svc.rpc('get_teacher_attendance_stats',  { p_school_id: auth.schoolId, p_days_back: 90 }),
    svc.from('timetable_periods')
       .select('teacher_id, teacher_name, day_of_week, start_time, end_time, class_name, subject')
       .eq('school_id', auth.schoolId)
       .eq('is_active', true)
       .eq('period_type', 'lesson'),
  ])

  const prompt = buildDutyPrompt(
    week_start,
    dates,
    duty_slots,
    (appraisalRows  ?? []) as AppraisalScore[],
    (attendanceRows ?? []) as AttendanceStat[],
    (timetableRows  ?? []) as TimetablePeriod[],
    teacher_ids,
  )

  // ── AI generation: Groq → Gemini fallback ─────────────────────
  let result: z.infer<typeof DutyRosterSchema>

  const groqKey = process.env.GROQ_API_KEY
  try {
    if (!groqKey) throw new Error('no key')
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}`)
    const groqData = await groqRes.json() as { choices?: { message: { content: string } }[] }
    const raw = groqData.choices?.[0]?.message?.content ?? '{}'
    const validated = DutyRosterSchema.safeParse(JSON.parse(raw))
    if (!validated.success) throw new Error('schema mismatch')
    result = validated.data
  } catch {
    try {
      const { object } = await generateObject({
        model:     google('gemini-2.0-flash'),
        prompt,
        schema:    DutyRosterSchema,
        maxTokens: 4000,
      })
      result = object as z.infer<typeof DutyRosterSchema>
    } catch (err) {
      console.error('[duty-roster/generate] AI failed', err)
      return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 502 })
    }
  }

  // ── Persist to duty_roster ─────────────────────────────────────
  if (result.assignments.length > 0) {
    // Get staff record for created_by
    const { data: staffRow } = await svc
      .from('staff_records')
      .select('id')
      .eq('user_id', auth.userId)
      .single()

    const rows = result.assignments.map(a => ({
      school_id:    auth.schoolId,
      teacher_id:   a.teacher_id,
      teacher_name: a.teacher_name,
      duty_date:    a.duty_date,
      day_of_week:  a.day_of_week,
      duty_type:    a.duty_type,
      shift_start:  a.shift_start,
      shift_end:    a.shift_end,
      location:     a.location ?? null,
      notes:        a.notes    ?? null,
      week_start,
      ai_generated: true,
      created_by:   staffRow ? (staffRow as { id: string }).id : null,
    }))

    const { error: upsertErr } = await svc
      .from('duty_roster')
      .upsert(rows, { onConflict: 'school_id,teacher_id,duty_date,duty_type' })

    if (upsertErr) {
      console.error('[duty-roster/generate] persist error', upsertErr)
      return NextResponse.json({ ...result, persist_error: upsertErr.message })
    }
  }

  return NextResponse.json({
    assignments:  result.assignments,
    warnings:     result.warnings,
    rationale:    result.rationale,
    week_start,
    total:        result.assignments.length,
    persisted:    true,
  })
}

// GET — fetch roster for a specific week
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const canView = DEPUTY_ROLES.has(auth.subRole) ||
    ['principal', 'super_admin', 'teacher'].includes(auth.subRole)
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const week = req.nextUrl.searchParams.get('week_start')
  const svc  = createAdminSupabaseClient()

  let query = svc
    .from('duty_roster')
    .select('id, teacher_id, teacher_name, duty_date, day_of_week, duty_type, shift_start, shift_end, location, notes, week_start')
    .eq('school_id', auth.schoolId)
    .order('duty_date')
    .order('shift_start')

  if (week) query = query.eq('week_start', week)

  // Teachers only see their own duty
  if (auth.subRole === 'teacher') {
    const { data: staffRow } = await svc
      .from('staff_records').select('id').eq('user_id', auth.userId).single()
    if (staffRow) {
      query = query.eq('teacher_id', (staffRow as { id: string }).id)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ assignments: data ?? [], week_start: week ?? null })
}

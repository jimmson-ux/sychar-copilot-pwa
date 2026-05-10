import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/timetable/generate
 *
 * AI-assisted timetable generation for Deputy Principal / Dean.
 * Reads existing teacher workload from DB, then asks Claude (→ Gemini fallback)
 * to produce a balanced weekly schedule respecting:
 *   - Each class gets all required subjects
 *   - No teacher teaches two classes in the same period
 *   - Balanced workload: ≤ MAX_PERIODS_PER_DAY lessons per teacher per day
 *   - Duty roster slots inserted as period_type = 'duty'
 *   - Double periods flagged where allowed (is_double = true)
 *
 * Body:
 *   {
 *     class_ids:         string[]          — classes to schedule
 *     subject_teachers:  { subject: string; teacher_id: string; teacher_name: string; classes: string[] }[]
 *     breaks:            { name: string; start_time: string; end_time: string }[]
 *     school_day_start:  string            — "07:30"
 *     school_day_end:    string            — "17:00"
 *     lesson_duration:   number            — minutes, default 40
 *     days_per_week:     number            — 5
 *   }
 *
 * Returns: { periods: TimetablePeriod[], warnings: string[] }
 */

const DEPUTY_ROLES = new Set([
  'deputy_principal', 'deputy_principal_academic', 'dean_of_studies',
])

// ── Zod schema for structured AI output ────────────────────────────────────
const PeriodSchema = z.object({
  class_id:      z.string(),
  class_name:    z.string(),
  subject:       z.string(),
  teacher_id:    z.string(),
  teacher_name:  z.string(),
  day_of_week:   z.number().int().min(1).max(5),  // 1=Mon … 5=Fri
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

type TimetableOutput = z.infer<typeof TimetableSchema>

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildTimetablePrompt(body: {
  class_ids:        string[]
  subject_teachers: { subject: string; teacher_id: string; teacher_name: string; classes: string[] }[]
  breaks:           { name: string; start_time: string; end_time: string }[]
  school_day_start: string
  school_day_end:   string
  lesson_duration:  number
  days_per_week:    number
}, workload: { teacher_id: string; teacher_name: string; lesson_count: number }[]): string {
  const subjectLines = body.subject_teachers
    .map(st => `• ${st.teacher_name} (${st.teacher_id}): teaches ${st.subject} to classes [${st.classes.join(', ')}]`)
    .join('\n')

  const breakLines = body.breaks
    .map(b => `• ${b.name}: ${b.start_time}–${b.end_time}`)
    .join('\n')

  const workloadLines = workload
    .map(w => `• ${w.teacher_name}: ${w.lesson_count} periods already this week`)
    .join('\n')

  return `You are a school timetable scheduling expert. Generate a complete weekly timetable for a Kenyan secondary school.

School day: ${body.school_day_start} to ${body.school_day_end}
Lesson duration: ${body.lesson_duration} minutes
Days per week: ${body.days_per_week} (Monday=1 to Friday=5)
Classes to schedule: ${body.class_ids.join(', ')}

Fixed breaks (skip these slots):
${breakLines}

Subject-teacher assignments:
${subjectLines}

Current teacher workload (to balance):
${workloadLines || '• No existing periods yet'}

Rules:
1. No teacher teaches two different classes in the same period on the same day
2. Spread a teacher's lessons across the week (avoid > 4 lessons per day per teacher)
3. Each class must have every assigned subject at least once per week
4. Insert a 'duty' period_type for one teacher per day at break time for playground supervision
5. Mark consecutive same-subject periods for the same class as is_double=true
6. Use realistic Kenyan school subjects: Maths, English, Kiswahili, Physics, Chemistry, Biology, History, Geography, CRE, Business, Agriculture, Computer Studies, Art, Music, PE
7. start_time and end_time must be HH:MM format (24-hour)
8. period_number is sequential per class per day starting from 1
9. Add warnings for any scheduling conflicts you cannot resolve

Generate the full timetable covering all classes for all 5 days.`
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!DEPUTY_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Only Deputy Principal or Dean of Studies can generate timetables' }, { status: 403 })
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
  } = body as {
    class_ids:        string[]
    subject_teachers: { subject: string; teacher_id: string; teacher_name: string; classes: string[] }[]
    breaks:           { name: string; start_time: string; end_time: string }[]
    school_day_start: string
    school_day_end:   string
    lesson_duration:  number
    days_per_week:    number
  }

  const svc = createAdminSupabaseClient()

  // Fetch current teacher workload for balancing
  const { data: workloadRows } = await svc.rpc('get_teacher_workload_summary', {
    p_school_id: auth.schoolId,
  })
  const workload = (workloadRows ?? []) as { teacher_id: string; teacher_name: string; lesson_count: number }[]

  const prompt = buildTimetablePrompt(
    { class_ids, subject_teachers, breaks, school_day_start, school_day_end, lesson_duration, days_per_week },
    workload,
  )

  // ── AI generation: Claude → Gemini fallback ────────────────────────────
  let result: TimetableOutput

  try {
    const { object } = await generateText({
      model:       anthropic('claude-opus-4.7'),
      prompt,
      maxTokens:   4000,
      output:      { type: 'object', schema: TimetableSchema },
    })
    result = object as TimetableOutput
  } catch {
    try {
      const { object } = await generateText({
        model:       google('gemini-2.0-flash'),
        prompt,
        maxTokens:   4000,
        output:      { type: 'object', schema: TimetableSchema },
      })
      result = object as TimetableOutput
    } catch (err) {
      console.error('[timetable/generate] AI failed', err)
      return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 502 })
    }
  }

  // ── Persist generated periods to timetable_periods ─────────────────────
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
      is_active:     true,
    }))

    // Upsert on (school_id, class_id, day_of_week, period_number) — replaces draft
    const { error: upsertErr } = await svc
      .from('timetable_periods')
      .upsert(rows, { onConflict: 'school_id,class_id,day_of_week,period_number' })

    if (upsertErr) {
      console.error('[timetable/generate] persist error', upsertErr)
      // Return result anyway — client can retry persist
      return NextResponse.json({ ...result, persist_error: upsertErr.message })
    }
  }

  return NextResponse.json({
    periods:       result.periods,
    warnings:      result.warnings,
    period_count:  result.periods.length,
    persisted:     true,
  })
}

// GET — return the current timetable for the school
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const canView = DEPUTY_ROLES.has(auth.subRole) ||
    ['principal', 'super_admin', 'teacher'].includes(auth.subRole)

  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

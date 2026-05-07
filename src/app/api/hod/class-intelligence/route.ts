// GET /api/hod/class-intelligence
// Returns AI-generated class attention ranking for the HOD's department.
// Uses marks + attendance data to rank classes by urgency.
// POST (no body) — forces a fresh analysis.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'

const HOD_ROLES = new Set([
  'hod_sciences','hod_mathematics','hod_languages',
  'hod_humanities','hod_applied_sciences','hod_games_sports',
  'hod_arts','hod_social_sciences','hod_technical','hod_pathways',
  'principal','deputy_principal','dean_of_studies',
])

async function runAI(prompt: string): Promise<string> {
  // Primary: Claude Haiku — fallback: Gemini Flash
  try {
    const { text } = await generateText({
      model:           anthropic('claude-haiku-4-5-20251001'),
      prompt,
      maxOutputTokens: 1200,
    })
    return text
  } catch {
    const { text } = await generateText({
      model:           google('gemini-2.0-flash'),
      prompt,
      maxOutputTokens: 1200,
    })
    return text
  }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!HOD_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — HOD role required' }, { status: 403 })
  }

  const db = createAdminSupabaseClient()

  const { data: myRecord } = await db
    .from('staff_records')
    .select('id,department')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  const dept = myRecord?.department ?? null

  const { data: snapshots } = await db
    .from('hod_intelligence_snapshots')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('department', dept)
    .order('computed_at', { ascending: false })
    .limit(12)

  if (snapshots?.length) {
    return NextResponse.json({ snapshots, department: dept, from_cache: true })
  }

  return NextResponse.json({
    snapshots:  [],
    department: dept,
    from_cache: false,
    message:    'No intelligence snapshot yet. Click Refresh Intelligence to generate.',
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!HOD_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createAdminSupabaseClient()

  const { data: myRecord } = await db
    .from('staff_records')
    .select('id,department,full_name')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .single()

  const dept = myRecord?.department ?? null

  const { data: assignments } = await db
    .from('teacher_subject_assignments')
    .select('teacher_id,subject_name,class_levels,curriculum_type')
    .eq('school_id', auth.schoolId)
    .eq('department', dept)
    .eq('is_active', true)

  if (!assignments?.length) {
    return NextResponse.json({
      error: 'No subject assignments found. Assign subjects to teachers first.',
      code:  'NO_ASSIGNMENTS',
    }, { status: 422 })
  }

  const { data: classData } = await db
    .from('students')
    .select('class_name,stream_name')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)

  const classes = [...new Map(
    (classData ?? []).map(c => [`${c.class_name}-${c.stream_name}`, c])
  ).values()]

  const subjectNames = [...new Set(assignments.map(a => a.subject_name))]
  const { data: marksData } = await db
    .from('marks')
    .select('student_id,subject_name,percentage,class_name,stream_name')
    .eq('school_id', auth.schoolId)
    .in('subject_name', subjectNames)
    .not('percentage', 'is', null)

  // attendance_records has class_name TEXT
  const since14 = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
  const { data: attData } = await db
    .from('attendance_records')
    .select('student_id,status,date,class_name')
    .eq('school_id', auth.schoolId)
    .gte('date', since14)

  const classSummaries = classes.map(cls => {
    const classKey = `${cls.class_name} ${cls.stream_name}`
    const classMarks = (marksData ?? []).filter(
      m => m.class_name === cls.class_name && m.stream_name === cls.stream_name
    )
    const classAtt = (attData ?? []).filter(
      a => a.class_name === classKey || a.class_name === cls.class_name
    )
    const avgScore = classMarks.length
      ? Math.round(classMarks.reduce((s, m) => s + (m.percentage ?? 0), 0) / classMarks.length)
      : null
    const absenceRate = classAtt.length
      ? Math.round(classAtt.filter(a => a.status === 'absent').length * 100 / classAtt.length)
      : 0
    return { class: classKey, avg_score: avgScore, absence_rate: absenceRate, marks_count: classMarks.length }
  })

  const prompt = `You are an academic intelligence engine for ${dept} department.
Classes: ${JSON.stringify(classSummaries)}
Subject assignments: ${JSON.stringify(assignments.map(a => ({ subject: a.subject_name, levels: a.class_levels })))}

Rank classes from MOST URGENT to LEAST URGENT attention needed.
Return ONLY JSON array:
[{
  "class": "Form 4 Winners",
  "urgency": "CRITICAL|HIGH|MEDIUM|LOW",
  "avg_score": 45,
  "absence_rate": 12,
  "recommendation": "one actionable sentence",
  "exam_advice": "one sentence on exam/CAT timing",
  "timetable_advice": "one sentence if slot should change, else null"
}]`

  try {
    const raw   = await runAI(prompt)
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in AI response')
    const snapshots = JSON.parse(match[0]) as Record<string, unknown>[]

    try {
      await db.from('hod_intelligence_snapshots').upsert(
        snapshots.map(s => ({
          school_id:        auth.schoolId,
          department:       dept,
          class_name:       String(s.class ?? '').split(' ').slice(0, -1).join(' '),
          stream_name:      String(s.class ?? '').split(' ').at(-1),
          urgency:          s.urgency,
          avg_score:        s.avg_score,
          absence_rate:     s.absence_rate,
          recommendation:   s.recommendation,
          exam_advice:      s.exam_advice,
          timetable_advice: s.timetable_advice ?? null,
          computed_at:      new Date().toISOString(),
          computed_by:      myRecord?.id ?? null,
        })),
        { onConflict: 'school_id,department,class_name,stream_name' }
      )
    } catch { /* table may not exist yet */ }

    return NextResponse.json({ snapshots, department: dept, from_cache: false })
  } catch (err) {
    console.error('[hod/class-intelligence]', err)
    return NextResponse.json({ error: 'AI analysis failed', details: String(err) }, { status: 500 })
  }
}

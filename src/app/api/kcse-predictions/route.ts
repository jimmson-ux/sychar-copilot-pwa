// POST /api/kcse-predictions — generate KCSE predictions for a class
// GET  /api/kcse-predictions — fetch saved predictions

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = new Set(['principal', 'deputy_principal_academics', 'deputy_principal_academic', 'dean_of_studies', 'dean', 'class_teacher'])

interface KcsePrediction {
  predictedMean: number
  predictedGrade: string
  subjectPredictions: Array<{ subject: string; grade: string; confidence: number }>
  universityEligible: boolean
  keyRisks: string[]
  recommendations: string[]
}

async function predictStudent(
  student: { id: string; full_name: string; form: string },
  marks: Array<{ subject: string; term: string; score: number }>,
  apiKey: string
): Promise<KcsePrediction | null> {
  // Group marks by term
  const byTerm: Record<string, Record<string, number>> = {}
  for (const m of marks) {
    if (!byTerm[m.term]) byTerm[m.term] = {}
    byTerm[m.term][m.subject] = m.score
  }

  const termSummaries = Object.entries(byTerm)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([term, subjects]) => `${term}: ${Object.entries(subjects).map(([s, sc]) => `${s}=${sc}%`).join(', ')}`)
    .join(' | ')

  if (!termSummaries) return null

  const prompt = `Student: ${student.full_name}, Form ${student.form}.
Performance history: ${termSummaries}

Based on this Kenyan secondary school student's performance trend, predict their KCSE outcome.
Return ONLY valid JSON (no markdown, no explanation):
{
  "predictedMean": <number 0-12 representing KCSE points>,
  "predictedGrade": "<A|A-|B+|B|B-|C+|C|C-|D+|D|D-|E>",
  "subjectPredictions": [{"subject":"<name>","grade":"<grade>","confidence":<0-100>}],
  "universityEligible": <true if predictedGrade >= C+>,
  "keyRisks": ["<top 2 subjects most likely to pull down mean>"],
  "recommendations": ["<1 actionable improvement per weak subject>"]
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You are a Kenyan secondary school academic analyst. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return null
  const data = await res.json() as { content?: Array<{ text: string }> }
  const text = data.content?.[0]?.text ?? ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as KcsePrediction
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db      = svc()
  const classId = req.nextUrl.searchParams.get('class_id')
  const studentId = req.nextUrl.searchParams.get('student_id')

  let query = db
    .from('kcse_predictions')
    .select('id, student_id, predicted_mean, predicted_grade, subject_predictions, university_eligible, key_risks, recommendations, generated_at, students(full_name, class_name, admission_number)')
    .eq('school_id', auth.schoolId!)
    .order('generated_at', { ascending: false })
    .limit(200)

  if (classId)   query = query.eq('class_id', classId)
  if (studentId) query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ predictions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Dean, principal, or class teacher required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    classId: string
    examType?: string
  } | null

  if (!body?.classId) {
    return NextResponse.json({ error: 'classId required' }, { status: 400 })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 })
  }

  const db = svc()

  // Fetch students in class
  const { data: students, error: studErr } = await db
    .from('students')
    .select('id, full_name, current_form, class_name')
    .eq('school_id', auth.schoolId!)
    .eq('class_id', body.classId)
    .eq('is_active', true)

  if (studErr || !students?.length) {
    return NextResponse.json({ error: 'No active students found in class' }, { status: 404 })
  }

  // Fetch marks for all students in this class (last 3 terms)
  const studentIds = students.map((s: { id: string }) => s.id)

  const { data: marksRaw } = await db
    .from('marks')
    .select('student_id, subject_name, term, score, percentage')
    .in('student_id', studentIds)
    .eq('school_id', auth.schoolId!)
    .order('term', { ascending: true })

  type MarkRow = { student_id: string; subject_name: string; term: string; score: number; percentage: number | null }
  const marksByStudent = new Map<string, Array<{ subject: string; term: string; score: number }>>()
  for (const m of ((marksRaw ?? []) as MarkRow[])) {
    if (!marksByStudent.has(m.student_id)) marksByStudent.set(m.student_id, [])
    marksByStudent.get(m.student_id)!.push({
      subject: m.subject_name,
      term: m.term,
      score: m.percentage ?? m.score,
    })
  }

  type StudentRow = { id: string; full_name: string; current_form: string | null; class_name: string | null }
  const results: Array<{ student_id: string; name: string; prediction: KcsePrediction | null }> = []

  // Process up to 30 students (Claude cost control)
  const batch = (students as StudentRow[]).slice(0, 30)

  for (const student of batch) {
    const marks = marksByStudent.get(student.id) ?? []
    if (marks.length === 0) continue

    const prediction = await predictStudent(
      { id: student.id, full_name: student.full_name, form: student.current_form ?? '4' },
      marks,
      ANTHROPIC_API_KEY
    )

    if (prediction) {
      results.push({ student_id: student.id, name: student.full_name, prediction })

      // Upsert prediction
      await db.from('kcse_predictions').upsert({
        school_id:           auth.schoolId,
        student_id:          student.id,
        class_id:            body.classId,
        predicted_mean:      prediction.predictedMean,
        predicted_grade:     prediction.predictedGrade,
        subject_predictions: prediction.subjectPredictions,
        university_eligible: prediction.universityEligible,
        key_risks:           prediction.keyRisks,
        recommendations:     prediction.recommendations,
        generated_at:        new Date().toISOString(),
        academic_year:       new Date().getFullYear().toString(),
      }, { onConflict: 'school_id,student_id' }).then(() => {}, () => {})
    }
  }

  // Class summary
  const eligible = results.filter(r => r.prediction?.universityEligible).length
  const grades: Record<string, number> = {}
  for (const r of results) {
    if (r.prediction?.predictedGrade) {
      grades[r.prediction.predictedGrade] = (grades[r.prediction.predictedGrade] ?? 0) + 1
    }
  }

  return NextResponse.json({
    ok:               true,
    studentsProcessed: results.length,
    universityEligible: eligible,
    eligibilityRate:  results.length > 0 ? Math.round(eligible / results.length * 100) : 0,
    gradeDistribution: grades,
    predictions:      results,
  })
}

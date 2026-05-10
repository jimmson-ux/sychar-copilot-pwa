// GET /api/parent/student/[studentId]/kcse-prediction
// Returns the cached KCSE prediction for the student.
// If no prediction exists, generates one on-demand from the student's marks.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { z } from 'zod'

// ── Types ─────────────────────────────────────────────────────────────────────

type SubjectPrediction = { subject: string; grade: string; confidence: number }

type KcsePrediction = {
  predictedMean:      number
  predictedGrade:     string
  subjectPredictions: SubjectPrediction[]
  universityEligible: boolean
  keyRisks:           string[]
  recommendations:    string[]
}

type MarkRow = {
  percentage:    number | null
  term:          string | null
  academic_year: string | null
  subjects:      { name: string } | { name: string }[] | null
}

// ── Prediction generator ──────────────────────────────────────────────────────

async function generatePrediction(
  studentName: string,
  form:        string,
  marks:       MarkRow[],
): Promise<KcsePrediction | null> {
  // Summarise marks per subject × term
  const bySubjectTerm = new Map<string, { sum: number; count: number }>()
  for (const m of marks) {
    const subjectArr = m.subjects
    const name       = Array.isArray(subjectArr)
      ? (subjectArr[0] as { name: string })?.name
      : (subjectArr as { name: string } | null)?.name
    if (!name || m.percentage == null) continue
    const key   = `${name}|${m.academic_year}-T${m.term}`
    const entry = bySubjectTerm.get(key) ?? { sum: 0, count: 0 }
    entry.sum   += m.percentage
    entry.count += 1
    bySubjectTerm.set(key, entry)
  }

  if (bySubjectTerm.size === 0) return null

  const summary = Array.from(bySubjectTerm.entries())
    .map(([k, v]) => `${k}: ${Math.round(v.sum / v.count)}%`)
    .join('; ')

  const prompt = `Kenyan secondary school student: ${studentName}, Form ${form}.
Performance history (subject|term: avg%): ${summary}

Predict their KCSE outcome. Return ONLY valid JSON, no markdown:
{
  "predictedMean": <0-12>,
  "predictedGrade": "<A|A-|B+|B|B-|C+|C|C-|D+|D|D-|E>",
  "subjectPredictions": [{"subject":"<name>","grade":"<grade>","confidence":<0-100>}],
  "universityEligible": <true if predictedGrade is C+ or above>,
  "keyRisks": ["<top 2 subjects most likely to drag the mean>"],
  "recommendations": ["<one actionable tip per at-risk subject>"]
}`

  try {
    const { text } = await generateText({
      model:       anthropic('claude-haiku-4.5'),
      maxTokens:   700,
      system:      'You are a Kenyan secondary school academic analyst. Return only valid JSON.',
      messages:    [{ role: 'user', content: prompt }],
    })

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as KcsePrediction
  } catch {
    return null
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const { studentId } = await params

  if (!parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  // ── 1. Check cache ──────────────────────────────────────────────────────────
  const { data: cached } = await svc
    .from('kcse_predictions')
    .select('predicted_mean, predicted_grade, subject_predictions, university_eligible, key_risks, recommendations, generated_at')
    .eq('school_id',  parent.schoolId)
    .eq('student_id', studentId)
    .single()

  // Return cached prediction if it exists (school staff may have generated it)
  const STALE_DAYS = 30
  const isFresh = cached?.generated_at
    ? (Date.now() - new Date(cached.generated_at).getTime()) < STALE_DAYS * 86_400_000
    : false

  if (cached && isFresh) {
    return NextResponse.json({
      prediction: {
        predictedMean:      cached.predicted_mean,
        predictedGrade:     cached.predicted_grade,
        subjectPredictions: (cached.subject_predictions as SubjectPrediction[]) ?? [],
        universityEligible: cached.university_eligible,
        keyRisks:           (cached.key_risks as string[]) ?? [],
        recommendations:    (cached.recommendations as string[]) ?? [],
      },
      generatedAt: cached.generated_at,
      fromCache:   true,
    })
  }

  // ── 2. Generate on demand ───────────────────────────────────────────────────
  const [{ data: studentRow }, { data: marksRaw }] = await Promise.all([
    svc
      .from('students')
      .select('full_name, form')
      .eq('id', studentId)
      .single(),

    svc
      .from('marks')
      .select('percentage, term, academic_year, subjects(name)')
      .eq('student_id', studentId)
      .not('percentage', 'is', null)
      .order('academic_year', { ascending: false })
      .order('term',          { ascending: false })
      .limit(200),
  ])

  if (!studentRow) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const prediction = await generatePrediction(
    studentRow.full_name,
    String(studentRow.form ?? '4'),
    (marksRaw ?? []) as MarkRow[],
  )

  if (!prediction) {
    return NextResponse.json(
      { error: 'Not enough academic data to generate a prediction yet' },
      { status: 422 },
    )
  }

  const now = new Date().toISOString()

  // Upsert — intentionally fire-and-forget; don't block the response
  svc.from('kcse_predictions').upsert(
    {
      school_id:           parent.schoolId,
      student_id:          studentId,
      predicted_mean:      prediction.predictedMean,
      predicted_grade:     prediction.predictedGrade,
      subject_predictions: prediction.subjectPredictions,
      university_eligible: prediction.universityEligible,
      key_risks:           prediction.keyRisks,
      recommendations:     prediction.recommendations,
      generated_at:        now,
      academic_year:       String(new Date().getFullYear()),
    },
    { onConflict: 'school_id,student_id' },
  ).then(() => {}, () => {})

  return NextResponse.json({ prediction, generatedAt: now, fromCache: false })
}

// GET  /api/university-matching?student_id=xxx  – return saved matches
// POST /api/university-matching  – generate via Claude, persist, return

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

// Client created inside each handler — never at module level.
// Module-level createClient() calls are evaluated at build time on Vercel
// when SUPABASE_SERVICE_ROLE_KEY is not yet available.
function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string
  full_name: string
  gender: string
  class_name: string
  stream_name: string
  pathway: string | null
  kcpe_marks: number | null
  curriculum_type: string
}

interface PredictionRow {
  predicted_grade: string
  predicted_points: number
  confidence: number
  intervention_needed: boolean
}

interface UniversityMatchResult {
  matches: {
    university: string
    country: string
    program: string
    match_score: number
    tuition_kes_per_year: number
    scholarship_available: boolean
    scholarship_name: string
    minimum_grade: string
    why_matched: string
    application_deadline: string
    link: string
  }[]
  career_tracks: string[]
  summary: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(student: StudentRow, prediction: PredictionRow | null): string {
  const predSection = prediction
    ? `## KCSE Prediction
- Predicted Grade: ${prediction.predicted_grade}
- Predicted Points: ${prediction.predicted_points}
- Confidence: ${Math.round(prediction.confidence * 100)}%
- Intervention Needed: ${prediction.intervention_needed ? 'Yes' : 'No'}`
    : `## KCSE Prediction\n- Not yet available (assume average performance)`

  return `You are a university admissions advisor for a Kenyan secondary school. Match this student to suitable universities globally.

## Student Profile
- Name: ${student.full_name}
- Gender: ${student.gender}
- Class: ${student.class_name} | Stream: ${student.stream_name}
- Pathway / Specialisation: ${student.pathway ?? 'General'}
- KCPE Score: ${student.kcpe_marks ?? 'Not available'}/500
- Curriculum: ${student.curriculum_type}

${predSection}

## Instructions
Generate 8–10 university matches spanning Kenya, UK, Germany, UAE, Canada, and Australia.
Select programs that align with the student's pathway and predicted performance.

Guidelines per country:
- Kenya: University of Nairobi, Strathmore University, USIU-Africa, JKUAT, Kenyatta University
- UK: University of Edinburgh, University of Birmingham, Coventry University, University of Nottingham
- Germany: TU Munich, RWTH Aachen University, FU Berlin, Heidelberg University (tuition-free or low-cost)
- UAE: American University of Sharjah, University of Sharjah, Khalifa University
- Canada: University of Toronto, UBC, Carleton University, University of Calgary
- Australia: University of Melbourne, Monash University, RMIT, University of Sydney

Score each match 0–100 based on alignment. Include scholarships for Kenyan students where available (e.g. DAAD for Germany, Commonwealth for UK, Aga Khan for EA).

Return ONLY valid JSON with no markdown fences or extra text:
{
  "matches": [
    {
      "university": "full university name",
      "country": "country name",
      "program": "specific undergraduate degree program",
      "match_score": 85,
      "tuition_kes_per_year": 450000,
      "scholarship_available": true,
      "scholarship_name": "name of scholarship or empty string",
      "minimum_grade": "B+ (KCSE) or equivalent",
      "why_matched": "2–3 sentences explaining the fit",
      "application_deadline": "Month Year or Rolling",
      "link": "https://official-admissions-url"
    }
  ],
  "career_tracks": ["Track 1", "Track 2", "Track 3"],
  "summary": "2–3 sentence overview of this student's global university prospects and recommended next steps."
}`
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sb = getSb()

  const { searchParams } = new URL(req.url)
  const student_id = searchParams.get('student_id')
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })

  const { data, error } = await sb
    .from('ai_career_reports')
    .select('id, student_id, university_matches, generated_at')
    .eq('student_id', student_id)
    .eq('school_id', auth.schoolId) // verified school_id from session — cannot be spoofed
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[university-matching] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to load report' }, { status: 500 })
  }
  return NextResponse.json({ report: data ?? null })
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sb = getSb()
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('[university-matching] ANTHROPIC_API_KEY not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  try {
    const body = await req.json() as { student_id?: string }
    const { student_id } = body
    if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 })

    // 1. Fetch student — school_id from verified session prevents cross-tenant IDOR
    const { data: student, error: sErr } = await sb
      .from('students')
      .select('id, full_name, gender, class_name, stream_name, pathway, kcpe_marks, curriculum_type')
      .eq('id', student_id)
      .eq('school_id', auth.schoolId)
      .single()

    if (sErr || !student) {
      return NextResponse.json({ error: sErr?.message ?? 'Student not found' }, { status: 404 })
    }

    // 2. Fetch latest KCSE prediction (may not exist)
    const { data: prediction } = await sb
      .from('kcse_predictions')
      .select('predicted_grade, predicted_points, confidence, intervention_needed')
      .eq('student_id', student_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 3. Call Claude
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: buildPrompt(student as StudentRow, prediction as PredictionRow | null) }],
      }),
    })

    if (!aiRes.ok) {
      const errBody = await aiRes.text()
      console.error('[university-matching] Claude error:', aiRes.status, errBody.slice(0, 200))
      throw new Error('AI service unavailable')
    }

    const aiData = await aiRes.json() as { content: { text: string }[] }
    const rawText = aiData.content?.[0]?.text ?? ''
    const jsonStr = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: UniversityMatchResult
    try {
      parsed = JSON.parse(jsonStr) as UniversityMatchResult
    } catch {
      throw new Error(`Claude returned non-JSON: ${rawText.slice(0, 300)}`)
    }

    if (!Array.isArray(parsed.matches)) {
      throw new Error('Claude response missing matches array')
    }

    // 4. Upsert into ai_career_reports (update if row exists, insert otherwise)
    const now = new Date().toISOString()

    const { data: existing } = await sb
      .from('ai_career_reports')
      .select('id')
      .eq('student_id', student_id)
      .eq('school_id', auth.schoolId)
      .limit(1)
      .maybeSingle()

    type SavedReport = { id: string; student_id: string; university_matches: UniversityMatchResult; generated_at: string }
    let saved: SavedReport | null = null

    if (existing) {
      const { data, error: updErr } = await sb
        .from('ai_career_reports')
        .update({ university_matches: parsed, generated_at: now })
        .eq('id', (existing as { id: string }).id)
        .select('id, student_id, university_matches, generated_at')
        .single()
      if (updErr) throw new Error('Update failed: ' + updErr.message)
      saved = data as unknown as SavedReport
    } else {
      const { data, error: insErr } = await sb
        .from('ai_career_reports')
        .insert({ student_id, school_id: auth.schoolId, university_matches: parsed, generated_at: now })
        .select('id, student_id, university_matches, generated_at')
        .single()
      if (insErr) throw new Error('Insert failed: ' + insErr.message)
      saved = data as unknown as SavedReport
    }

    return NextResponse.json({ report: saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

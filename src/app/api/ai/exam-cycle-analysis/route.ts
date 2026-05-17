// POST /api/ai/exam-cycle-analysis
// AI cross-cycle academic analysis for Dean / Deputy Principal dashboards.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set([
  'dean_of_studies', 'deputy_dean_of_studies',
  'deputy_principal_academic', 'deputy_principal_academics',
  'principal',
])

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`exam-analysis:${ip}`, LIMITS.AI_CHAT.max, LIMITS.AI_CHAT.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: dean or deputy only' }, { status: 403 })
  }

  let body: { term?: string; academic_year?: string } = {}
  try { body = await req.json() } catch { /* use defaults */ }

  const month = new Date().getMonth() + 1
  const term  = body.term ?? String(month <= 4 ? 1 : month <= 8 ? 2 : 3)
  const year  = body.academic_year ?? String(new Date().getFullYear())

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const db = svc()

  // Fetch exam scores with subject and student context
  const { data: scores } = await db
    .from('marks')
    .select('percentage, subject_id, student_id, created_at')
    .eq('school_id', auth.schoolId!)
    .eq('term', String(term))
    .eq('academic_year', year)
    .limit(500)

  const { data: subjects } = await db
    .from('subjects')
    .select('id, name, cognitive_demand')
    .eq('school_id', auth.schoolId!)

  const subjectMap: Record<string, string> = {}
  for (const s of (subjects ?? [])) {
    subjectMap[s.id] = s.name
  }

  // Aggregate per subject
  const subjectStats: Record<string, { name: string; scores: number[] }> = {}
  for (const row of (scores ?? [])) {
    if (!row.subject_id) continue
    const name = subjectMap[row.subject_id] ?? row.subject_id
    if (!subjectStats[row.subject_id]) {
      subjectStats[row.subject_id] = { name, scores: [] }
    }
    subjectStats[row.subject_id].scores.push(Number(row.percentage ?? 0))
  }

  const subjectSummary = Object.values(subjectStats).map(s => {
    const avg = s.scores.length > 0
      ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length)
      : 0
    const passing = s.scores.filter(sc => sc >= 50).length
    const failRate = s.scores.length > 0
      ? Math.round(((s.scores.length - passing) / s.scores.length) * 100)
      : 0
    return `${s.name}: avg ${avg}%, fail rate ${failRate}% (n=${s.scores.length})`
  }).join('\n')

  const totalStudents = new Set((scores ?? []).map(r => r.student_id)).size
  const atRisk = (scores ?? []).filter(r => Number(r.percentage ?? 0) < 40)
  const atRiskStudents = new Set(atRisk.map(r => r.student_id)).size

  const context = `
Academic Year: ${year}, Term: ${term}
Total students assessed: ${totalStudents}
Students at risk (<40% overall): ${atRiskStudents}

Subject performance:
${subjectSummary || 'No exam data available'}
`.trim()

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are an academic analyst for a Kenyan secondary school. Analyze the following exam data and return ONLY valid JSON with no markdown:

{
  "trend_summary": "2-3 sentence overall academic health summary",
  "subject_highlights": [{"subject": "", "status": "strong|average|weak", "insight": ""}],
  "at_risk_count": 0,
  "recommended_interventions": ["specific actionable intervention"]
}

School data:
${context}`,
      }],
    }),
  })
  if (!groqRes.ok) return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  const groqData = await groqRes.json() as { choices?: { message: { content: string } }[] }
  const rawText = groqData.choices?.[0]?.message?.content ?? '{}'
  let analysis: Record<string, unknown>
  try {
    analysis = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch {
    analysis = { trend_summary: rawText, at_risk_count: atRiskStudents }
  }

  return NextResponse.json({ analysis, generatedAt: new Date().toISOString(), term, year })
}

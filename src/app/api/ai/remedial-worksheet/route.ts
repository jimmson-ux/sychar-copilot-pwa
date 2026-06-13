// POST /api/ai/remedial-worksheet
// Generates a teacher diagnostic insight + student worksheet for a topic with high failure rate.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'
import { askAIProvider } from '@/lib/aiProvider'

const TEACHER_ROLES = new Set([
  'class_teacher', 'subject_teacher', 'form_principal_form4',
  'form_principal_grade10', 'bom_teacher', 'quality_assurance',
  'hod_sciences', 'hod_mathematics', 'hod_languages', 'hod_humanities',
  'hod_applied_sciences', 'hod_games_sports', 'hod_arts',
  'hod_social_sciences', 'hod_technical', 'hod_pathways',
  'dean_of_studies', 'deputy_dean_of_studies', 'principal',
])

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`remedial:${ip}`, LIMITS.AI_CHAT.max, LIMITS.AI_CHAT.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!TEACHER_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Teacher access required' }, { status: 403 })
  }

  let body: { subject?: string; topic?: string; failureRate?: number; classLevel?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { subject, topic, failureRate = 0, classLevel = '' } = body
  if (!subject || !topic) {
    return NextResponse.json({ error: 'subject and topic required' }, { status: 400 })
  }

  let rawText = '{}'
  try {
    const ai = await askAIProvider(
      'You are an expert Kenyan secondary school curriculum specialist.',
      [{ role: 'user', content: `Create remedial resources for:
- Subject: ${subject}
- Topic: ${topic}
- Class level: ${classLevel || 'Secondary'}
- Failure rate in this topic: ${failureRate}%

Return ONLY valid JSON with no markdown:
{
  "teacher_diagnostic_insight": "2-3 sentences on likely root causes and teaching strategies to address them",
  "student_worksheet_markdown": "A structured markdown worksheet with: (1) brief concept recap, (2) 5 practice questions graded easy→hard, (3) one real-world application question relevant to Kenyan context"
}` }],
      1200,
    )
    rawText = ai.content || '{}'
  } catch { return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 }) }
  let result: { teacher_diagnostic_insight?: string; student_worksheet_markdown?: string }
  try {
    result = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch {
    result = { teacher_diagnostic_insight: rawText, student_worksheet_markdown: '' }
  }

  return NextResponse.json({
    teacher_diagnostic_insight: result.teacher_diagnostic_insight ?? '',
    student_worksheet_markdown: result.student_worksheet_markdown ?? '',
    subject, topic, failureRate, generatedAt: new Date().toISOString(),
  })
}

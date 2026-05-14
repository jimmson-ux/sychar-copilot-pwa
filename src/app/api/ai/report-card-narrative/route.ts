// POST /api/ai/report-card-narrative
// Generates a 4-sentence personalized class-teacher report card comment.

export const dynamic = 'force-dynamic'

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

const ALLOWED = new Set([
  'class_teacher', 'form_principal_form4', 'form_principal_grade10',
  'principal', 'dean_of_studies',
])

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`report-card:${ip}`, LIMITS.AI_CHAT.max, LIMITS.AI_CHAT.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Class teacher or principal access required' }, { status: 403 })
  }

  let body: {
    studentName?: string
    averageScore?: number
    attendance?: number
    conduct?: string
    strengths?: string[]
    areas_to_improve?: string[]
  } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    studentName,
    averageScore = 0,
    attendance = 0,
    conduct = 'satisfactory',
    strengths = [],
    areas_to_improve = [],
  } = body

  if (!studentName) {
    return NextResponse.json({ error: 'studentName required' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Write a concise, professional 4-sentence report card comment for a Kenyan secondary school student.

Student: ${studentName}
Average score: ${averageScore}%
Attendance: ${attendance}%
Conduct: ${conduct}
Strengths: ${strengths.join(', ') || 'general effort'}
Areas to improve: ${areas_to_improve.join(', ') || 'continue working hard'}

Rules:
- Exactly 4 sentences
- Positive and encouraging tone
- Specific to the data above (not generic)
- Suitable for parents to read
- Do NOT include student name in output (it will be added separately)
- Plain text only, no JSON, no markdown`,
    }],
  })

  const narrative = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''

  return NextResponse.json({ narrative, generatedAt: new Date().toISOString() })
}

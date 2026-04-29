// POST /api/parent/chat/groq
// Body: { message, conversationHistory? }
// Groq llama-3.3-70b-versatile with PostgreSQL context function.
// Parent identified by JWT phone (our system's parent_id).

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

type ConversationMessage = { role: 'user' | 'assistant'; content: string }

function detectLanguage(text: string): 'sw' | 'en' {
  return /\b(habari|mtoto|shule|ada|malipo|mwalimu|tafadhali|asante|sawa|nini|lini)\b/i.test(text)
    ? 'sw' : 'en'
}

function classifyContext(msg: string): string {
  const l = msg.toLowerCase()
  if (/fee|balance|payment|ada|malipo|paybill/.test(l))    return 'fee'
  if (/attend|absent|present|siku|shule/.test(l))          return 'attendance'
  if (/mark|grade|exam|result|alama|mtihani/.test(l))      return 'marks'
  if (/discipline|suspend|behavior|tabia/.test(l))         return 'discipline'
  if (/clinic|sick|nurse|health|mgonjwa/.test(l))          return 'clinic'
  return 'general'
}

function detectSentiment(msg: string): 'concerned' | 'neutral' | 'positive' {
  const l = msg.toLowerCase()
  if (/worried|concern|problem|urgent|fail|absent|suspend|sick|angry|why/.test(l)) return 'concerned'
  if (/thank|good|great|happy|improve|pass|excellent/.test(l)) return 'positive'
  return 'neutral'
}

export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({})) as {
    message?:             string
    conversationHistory?: ConversationMessage[]
  }

  const message = body.message?.trim()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  // Fetch full context via PostgreSQL function (parent_id = phone number)
  const { data: ctx, error: ctxErr } = await svc
    .rpc('get_parent_context_for_ai', { p_parent_id: parent.phone })

  if (ctxErr || !ctx || ctx.error) {
    return NextResponse.json({ error: 'Context unavailable' }, { status: 502 })
  }

  const isSwahili  = detectLanguage(message) === 'sw'
  const schoolName = (ctx as { school?: { name?: string } }).school?.name ?? 'the school'
  const term       = (ctx as { school?: { term?: string } }).school?.term ?? '1'
  const year       = (ctx as { school?: { year?: string } }).school?.year ?? new Date().getFullYear().toString()

  const systemPrompt = `You are Sychar AI, the school assistant for ${schoolName}.
You speak to parents about their children's school life.

CURRENT DATE: ${new Date().toLocaleDateString('en-KE')}
CURRENT TERM: Term ${term}, ${year}

PARENT DATA (children, fees, marks, attendance, discipline):
${JSON.stringify(ctx, null, 2)}

RULES:
- ONLY use data from the context above. Never invent figures.
- Fee amounts: always KES with commas (e.g. KES 12,500).
- Attendance: give % AND fraction (e.g. 87% — 52/60 days).
- Grades: CBC → EE/ME/AE/BE. 8-4-4 → A/B/C/D/E letters.
- If data missing: say "I don't have that information yet".
- NEVER reveal other students' data.
- Proactively flag: attendance < 80%, fee balance > KES 5,000, discipline incidents.
- Keep replies under 120 words unless detailed analysis is asked.
- Language: ${isSwahili ? 'Respond in Swahili. Keep numbers and dates in standard format.' : 'Respond in English. Kenyan English is fine.'}
- Tone: warm, like a school secretary who knows every family.`

  const history: ConversationMessage[] = (body.conversationHistory ?? []).slice(-10)

  const completion = await groq.chat.completions.create({
    model:      'llama-3.3-70b-versatile',
    max_tokens: 300,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ],
  })

  const reply   = completion.choices[0]?.message?.content?.trim() ?? ''
  const context = classifyContext(message)
  const sentiment = detectSentiment(message)

  // Log for staff visibility (non-critical, fire-and-forget)
  try {
    await svc.from('parent_query_logs').insert({
      school_id:        parent.schoolId,
      parent_phone:     parent.phone,
      student_id:       parent.studentIds[0] ?? null,
      query_text:       message,
      response_summary: reply.slice(0, 200),
      context_type:     context,
      language:         isSwahili ? 'sw' : 'en',
      sentiment,
      topics:           [context],
    })
  } catch { /* non-critical */ }

  return NextResponse.json({
    reply,
    context,
    language: isSwahili ? 'sw' : 'en',
  })
}

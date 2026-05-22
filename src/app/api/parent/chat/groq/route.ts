// POST /api/parent/chat/groq
// Primary: Anthropic Haiku (model set via ANTHROPIC_CHAT_MODEL env var)
// Fallback: Gemini 2.0 Flash (rate-limit only)
//
// Verified parent   → full school context chat
// Unverified parent → identity verification with tool extraction

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Model IDs are read from env — set ANTHROPIC_CHAT_MODEL in .env.local
const ANTHROPIC_MODEL = anthropic(process.env.ANTHROPIC_CHAT_MODEL!)
const GEMINI_MODEL    = google('gemini-2.0-flash')

// ── Types ─────────────────────────────────────────────────────────────────────

type ConversationMessage = { role: 'user' | 'assistant'; content: string }
type CtxType = Record<string, unknown>
type AIResult = { reply: string; provider: string }

// ── Rate-limit detection ──────────────────────────────────────────────────────

function isRateLimitOrOverload(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const status = (e.status ?? e.statusCode ?? e.code) as number | string | undefined
  if (status === 429 || status === 503) return true
  const msg = String(e.message ?? '').toLowerCase()
  return msg.includes('rate limit') || msg.includes('quota') ||
    msg.includes('overloaded') || msg.includes('capacity')
}

// ── Provider calls ────────────────────────────────────────────────────────────

async function callAnthropic(
  systemPrompt: string,
  history: ConversationMessage[],
  userMessage: string,
): Promise<AIResult> {
  const { text } = await generateText({
    model:  ANTHROPIC_MODEL,
    system: systemPrompt,
    messages: [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ],
    maxOutputTokens: 400,
  })
  return { reply: text.trim(), provider: 'anthropic' }
}

async function callGeminiFallback(
  systemPrompt: string,
  history: ConversationMessage[],
  userMessage: string,
): Promise<AIResult> {
  const { text } = await generateText({
    model:  GEMINI_MODEL,
    system: systemPrompt,
    messages: [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ],
    maxOutputTokens: 400,
  })
  return { reply: text.trim(), provider: 'gemini' }
}

async function callWithFallback(
  systemPrompt: string,
  history: ConversationMessage[],
  userMessage: string,
): Promise<AIResult> {
  try {
    return await callAnthropic(systemPrompt, history, userMessage)
  } catch (err) {
    if (!isRateLimitOrOverload(err)) throw err
  }
  return callGeminiFallback(systemPrompt, history, userMessage)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectLanguage(text: string): 'sw' | 'en' {
  return /\b(habari|mtoto|shule|ada|malipo|mwalimu|tafadhali|asante|sawa|nini|lini)\b/i.test(text)
    ? 'sw' : 'en'
}

function classifyContext(msg: string): string {
  const l = msg.toLowerCase()
  if (/fee|balance|payment|ada|malipo|paybill/.test(l))  return 'fee'
  if (/attend|absent|present|siku|shule/.test(l))         return 'attendance'
  if (/mark|grade|exam|result|alama|mtihani/.test(l))     return 'marks'
  if (/discipline|suspend|behavior|tabia/.test(l))        return 'discipline'
  if (/clinic|sick|nurse|health|mgonjwa/.test(l))         return 'clinic'
  return 'general'
}

function detectSentiment(msg: string): 'concerned' | 'neutral' | 'positive' {
  const l = msg.toLowerCase()
  if (/worried|concern|problem|urgent|fail|absent|suspend|sick|angry|why/.test(l)) return 'concerned'
  if (/thank|good|great|happy|improve|pass|excellent/.test(l)) return 'positive'
  return 'neutral'
}

function buildFullContextPrompt(
  ctx: CtxType,
  schoolName: string,
  term: string,
  year: string,
  isSwahili: boolean,
) {
  return `You are Sychar AI, the school assistant for ${schoolName}.
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
- Language: ${isSwahili ? 'Respond in Swahili.' : 'Respond in English. Kenyan English is fine.'}
- Tone: warm, like a school secretary who knows every family.`
}

function buildVerificationPrompt() {
  return `You are Sychar AI, the school assistant for Sychar Parent Portal.

The parent who just signed in has NOT yet been linked to a student account.
Your job is to verify their identity so they can access their child's school data.

INSTRUCTIONS:
1. Greet them warmly and explain you need to verify their identity.
2. Ask for: their child's FULL NAME and ADMISSION NUMBER.
3. Once they provide both details, call verify_parent immediately.
4. Do NOT reveal any student data until verification is confirmed.
5. Keep it friendly and brief.`
}

function buildExtractionPrompt(conversation: string) {
  return `Extract student full name and admission number from this conversation. Return ONLY valid JSON.

Conversation:
${conversation}

Format: {"student_name": "...", "admission_number": "..."}
Use null for any missing value.`
}

// ── Verification logic ────────────────────────────────────────────────────────

async function runVerification(
  svc: ReturnType<typeof createAdminSupabaseClient>,
  parentIdentifier: string,
  schoolId: string,
  studentName: string,
  admissionNumber: string,
): Promise<
  | { verified: true;  studentId: string; studentName: string; className: string }
  | { verified: false; reason: string }
> {
  const term = admissionNumber.trim()
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name, parent_email, parent_phone')
    .eq('school_id', schoolId)
    .or(`admission_no.ilike.${term},admission_number.ilike.${term}`)
    .limit(5)

  if (!students?.length) return { verified: false, reason: 'not_found' }

  const nameTokens = studentName.toLowerCase().split(/\s+/).filter(t => t.length >= 3)
  const match = (students as {
    id: string; full_name: string; class_name: string
    parent_email: string | null; parent_phone: string | null
  }[]).find(s => nameTokens.some(t => s.full_name.toLowerCase().includes(t)))

  if (!match) return { verified: false, reason: 'not_found' }

  const isEmail     = parentIdentifier.includes('@')
  const existingVal = isEmail ? match.parent_email : match.parent_phone
  if (existingVal && existingVal !== parentIdentifier) {
    return { verified: false, reason: 'already_linked' }
  }

  await svc.from('students')
    .update({ [isEmail ? 'parent_email' : 'parent_phone']: parentIdentifier })
    .eq('id', match.id)

  return {
    verified:    true,
    studentId:   match.id,
    studentName: match.full_name,
    className:   match.class_name,
  }
}

// ── Verification tool call via AI SDK ─────────────────────────────────────────

async function verificationWithToolCall(
  history: ConversationMessage[],
  userMessage: string,
): Promise<{ toolArgs: { student_name: string; admission_number: string } | null; promptReply: string | null }> {
  let verifyArgs: { student_name: string; admission_number: string } | null = null
  let promptReply: string | null = null

  const verifyParentTool = tool({
    description: 'Verify parent identity using student full name and admission number',
    inputSchema: z.object({
      student_name:     z.string().describe("Child's full name"),
      admission_number: z.string().describe("Child's admission number"),
    }),
    execute: async (args: { student_name: string; admission_number: string }) => {
      verifyArgs = args
      return { status: 'verifying' as const }
    },
  })

  const result = await generateText({
    model:  ANTHROPIC_MODEL,
    system: buildVerificationPrompt(),
    messages: [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ],
    tools:      { verify_parent: verifyParentTool },
    maxOutputTokens: 300,
    stopWhen:   stepCountIs(2),
  })

  if (!verifyArgs) {
    promptReply = result.text?.trim() ?? null
  }

  return { toolArgs: verifyArgs, promptReply }
}

// Extraction fallback when Anthropic is rate-limited
async function extractDetailsWithFallback(
  history: ConversationMessage[],
  userMessage: string,
): Promise<{ student_name: string | null; admission_number: string | null } | null> {
  const conversation = [
    ...history.map(m => `${m.role}: ${m.content}`),
    `user: ${userMessage}`,
  ].join('\n')

  try {
    const { text } = await generateText({
      model:     GEMINI_MODEL,
      system:    'You are a JSON extraction assistant. Return only valid JSON.',
      prompt:    buildExtractionPrompt(conversation),
      maxOutputTokens: 150,
    })
    const json = text.match(/\{[\s\S]*\}/)?.[0]
    if (!json) return null
    const parsed = JSON.parse(json) as { student_name?: string | null; admission_number?: string | null }
    return {
      student_name:     parsed.student_name     ?? null,
      admission_number: parsed.admission_number ?? null,
    }
  } catch { return null }
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

  const { data: ctx, error: ctxErr } = await svc
    .rpc('get_parent_context_for_ai', { p_parent_id: parent.phone })

  if (ctxErr) {
    console.error('[parent-chat] context RPC error:', ctxErr.message)
    return NextResponse.json({ error: 'Context unavailable' }, { status: 502 })
  }

  const children   = (ctx as { children?: unknown[] } | null)?.children
  const hasContext = Array.isArray(children) && children.length > 0
  const isSwahili  = detectLanguage(message) === 'sw'
  const history: ConversationMessage[] = (body.conversationHistory ?? []).slice(-10)

  // ── VERIFIED PARENT — full context chat ───────────────────────────────────
  if (hasContext) {
    const schoolName = (ctx as { school?: { name?: string } }).school?.name ?? 'the school'
    const term       = String((ctx as { school?: { term?: string } }).school?.term ?? '1')
    const year       = String((ctx as { school?: { year?: string } }).school?.year ?? new Date().getFullYear())

    const systemPrompt = buildFullContextPrompt(ctx as CtxType, schoolName, term, year, isSwahili)
    const { reply, provider } = await callWithFallback(systemPrompt, history, message)

    const context   = classifyContext(message)
    const sentiment = detectSentiment(message)

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
        ai_provider:      provider,
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ reply, context, language: isSwahili ? 'sw' : 'en', provider })
  }

  // ── UNVERIFIED PARENT — identity verification ─────────────────────────────

  let toolResult: Awaited<ReturnType<typeof verificationWithToolCall>> | null = null
  try {
    toolResult = await verificationWithToolCall(history, message)
  } catch (err) {
    if (!isRateLimitOrOverload(err)) throw err
  }

  if (toolResult?.toolArgs) {
    return handleVerification(
      svc, parent,
      toolResult.toolArgs.student_name,
      toolResult.toolArgs.admission_number,
      message, history, isSwahili,
    )
  }

  if (toolResult?.promptReply) {
    return NextResponse.json({
      reply:    toolResult.promptReply,
      context:  'verification',
      language: isSwahili ? 'sw' : 'en',
      verified: false,
      provider: 'anthropic',
    })
  }

  // Anthropic rate-limited AND user seems to have provided details → extraction fallback
  const combined = [...history, { role: 'user' as const, content: message }]
  const hasAdmission = combined.some(m => /\b[A-Z]{2,4}\/\d{3,6}|\d{4,8}\b/.test(m.content))
  const hasName      = combined.some(m => m.content.trim().split(/\s+/).length >= 2)

  if (hasAdmission && hasName && !toolResult) {
    const extracted = await extractDetailsWithFallback(history, message)
    if (extracted?.student_name && extracted?.admission_number) {
      return handleVerification(
        svc, parent, extracted.student_name, extracted.admission_number,
        message, history, isSwahili,
      )
    }
  }

  const { reply: fallbackPrompt, provider } = await callWithFallback(
    buildVerificationPrompt(), history, message,
  )
  return NextResponse.json({
    reply:    fallbackPrompt,
    context:  'verification',
    language: isSwahili ? 'sw' : 'en',
    verified: false,
    provider,
  })
}

// ── Shared verification outcome handler ──────────────────────────────────────

async function handleVerification(
  svc: ReturnType<typeof createAdminSupabaseClient>,
  parent: { phone: string; schoolId: string; studentIds: string[]; unauthorized?: null },
  studentName: string,
  admissionNumber: string,
  originalMessage: string,
  history: ConversationMessage[],
  isSwahili: boolean,
): Promise<NextResponse> {
  const result = await runVerification(
    svc, parent.phone, parent.schoolId, studentName, admissionNumber,
  )

  if (!result.verified) {
    const errMsg = result.reason === 'already_linked'
      ? "I found that student but their account is already linked to another parent. Please contact the school office for help."
      : "I couldn't find that student in our records. Please double-check the full name and admission number, then try again."
    return NextResponse.json({ reply: errMsg, context: 'verification', language: 'en', verified: false })
  }

  const { data: newCtx } = await svc
    .rpc('get_parent_context_for_ai', { p_parent_id: parent.phone })

  const schoolName = (newCtx as { school?: { name?: string } })?.school?.name ?? 'the school'
  const term       = String((newCtx as { school?: { term?: string } })?.school?.term ?? '1')
  const year       = String((newCtx as { school?: { year?: string } })?.school?.year ?? new Date().getFullYear())

  const systemPrompt = buildFullContextPrompt(
    newCtx as CtxType, schoolName, term, year, isSwahili,
  )
  const welcomeMsg = `I have been verified. Please greet me warmly and show a summary of ${result.studentName}'s school status.`

  const { reply, provider } = await callWithFallback(
    systemPrompt,
    [...history, { role: 'user', content: originalMessage }],
    welcomeMsg,
  )

  return NextResponse.json({
    reply,
    context:  'verification',
    language: isSwahili ? 'sw' : 'en',
    verified: true,
    provider,
  })
}

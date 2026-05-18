// POST /api/parent/chat/groq
// AI fallback chain: Groq (primary, free) → AI Gateway [Gemini → Claude → GPT] (fallback)
// Only 429 (rate-limit) and 503 (overloaded) trigger a fallback.
//
// Verified parent   → full school context chat
// Unverified parent → identity verification via Groq tool-call or AI Gateway extraction

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// ── Groq singleton ─────────────────────────────────────────────────────────────

let _groq: Groq | null = null
function getGroq() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' })
  return _groq
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ConversationMessage = { role: 'user' | 'assistant'; content: string }
type CtxType = Record<string, unknown>
type AIResult = { reply: string; provider: string }

// ── Rate-limit / overload detection ───────────────────────────────────────────

function isRateLimitOrOverload(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const status = (e.status ?? e.statusCode ?? e.code) as number | string | undefined
  if (status === 429 || status === 503) return true
  const msg = String(e.message ?? '').toLowerCase()
  return msg.includes('rate limit') || msg.includes('quota') ||
    msg.includes('overloaded') || msg.includes('capacity')
}

// ── Provider calls ─────────────────────────────────────────────────────────────

async function callGroq(
  systemPrompt: string,
  history: ConversationMessage[],
  userMessage: string,
): Promise<AIResult> {
  const completion = await getGroq().chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    max_tokens:  300,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ],
  })
  return {
    reply:    completion.choices[0]?.message?.content?.trim() ?? '',
    provider: 'groq',
  }
}

// Direct provider fallback: Gemini Flash → Claude Haiku
async function callDirectFallback(
  systemPrompt: string,
  history: ConversationMessage[],
  userMessage: string,
): Promise<AIResult> {
  const messages = [
    ...history.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  const providers: Array<{ fn: () => Promise<string>; name: string }> = [
    {
      name: 'gemini',
      fn: async () => {
        const { text } = await generateText({
          model: google('gemini-2.0-flash'),
          system: systemPrompt,
          messages,
          maxOutputTokens: 300,
        })
        return text
      },
    },
  ]

  for (const p of providers) {
    try {
      const text = await p.fn()
      return { reply: text.trim(), provider: p.name }
    } catch (err) {
      if (!isRateLimitOrOverload(err)) throw err
    }
  }

  return {
    reply:    'Our AI assistant is temporarily busy. Please try again in a moment.',
    provider: 'none',
  }
}

// ── Fallback orchestrator: Groq first, then direct providers ─────────────────

async function callWithFallback(
  systemPrompt: string,
  history: ConversationMessage[],
  userMessage: string,
): Promise<AIResult> {
  try {
    return await callGroq(systemPrompt, history, userMessage)
  } catch (err) {
    if (!isRateLimitOrOverload(err)) throw err
  }

  // Groq rate-limited → direct provider fallback (Gemini → Claude)
  return callDirectFallback(systemPrompt, history, userMessage)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
3. Once they provide both details, call the verify_parent tool immediately.
4. Do NOT reveal any student data until verification is confirmed.
5. If they seem confused, reassure them this is a one-time security check.
6. Keep it friendly and brief.`
}

function buildExtractionPrompt(conversation: string) {
  return `You are a data extraction assistant. From the conversation below, extract the student's full name and admission number if the parent has provided them.

Conversation:
${conversation}

Respond with ONLY valid JSON in this exact format:
{"student_name": "full name here", "admission_number": "number here"}
If either value is missing from the conversation, use null.
{"student_name": null, "admission_number": null}`
}

// ── Verification logic ─────────────────────────────────────────────────────────

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

  // Search by admission_no (new) OR admission_number (legacy) OR name match
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

// ── Groq tool-call verification (primary verification path) ───────────────────

async function groqVerificationCall(
  history: ConversationMessage[],
  userMessage: string,
) {
  const verifyTool = {
    type: 'function' as const,
    function: {
      name:        'verify_parent',
      description: 'Verify parent identity using student details provided by the parent',
      parameters: {
        type: 'object',
        properties: {
          student_name:     { type: 'string', description: "Child's full name" },
          admission_number: { type: 'string', description: "Child's admission number" },
        },
        required: ['student_name', 'admission_number'],
      },
    },
  }

  const completion = await getGroq().chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    max_tokens:  200,
    temperature: 0.5,
    tools:       [verifyTool],
    tool_choice: 'auto',
    messages: [
      { role: 'system', content: buildVerificationPrompt() },
      ...history,
      { role: 'user', content: userMessage },
    ],
  })

  return completion.choices[0]
}

// Extraction fallback when Groq is rate-limited
async function extractDetailsWithFallback(
  history: ConversationMessage[],
  userMessage: string,
): Promise<{ student_name: string | null; admission_number: string | null } | null> {
  const conversation = [
    ...history.map(m => `${m.role}: ${m.content}`),
    `user: ${userMessage}`,
  ].join('\n')

  try {
    const r = await generateText({
      model:           google('gemini-2.0-flash'),
      system:          'You are a JSON extraction assistant. Return only valid JSON.',
      prompt:          buildExtractionPrompt(conversation),
      maxOutputTokens: 150,
    })
    const text = r.text
    const json = text.match(/\{[\s\S]*\}/)?.[0]
    if (!json) return null
    const parsed = JSON.parse(json) as { student_name?: string | null; admission_number?: string | null }
    return {
      student_name:     parsed.student_name     ?? null,
      admission_number: parsed.admission_number ?? null,
    }
  } catch { return null }
}

// ── Main handler ───────────────────────────────────────────────────────────────

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

  // ── VERIFIED PARENT — full context chat ────────────────────────────────────
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

  // ── UNVERIFIED PARENT — identity verification ──────────────────────────────

  let groqChoice = null
  try {
    groqChoice = await groqVerificationCall(history, message)
  } catch (err) {
    if (!isRateLimitOrOverload(err)) throw err
  }

  // Groq returned a tool call → run verification
  if (
    groqChoice?.finish_reason === 'tool_calls' &&
    groqChoice.message.tool_calls?.[0]?.function?.name === 'verify_parent'
  ) {
    const toolCall = groqChoice.message.tool_calls[0]
    let args: { student_name?: string; admission_number?: string } = {}
    try { args = JSON.parse(toolCall.function.arguments) } catch { /* ignore */ }

    return handleVerification(
      svc, parent, args.student_name ?? '', args.admission_number ?? '',
      message, history, isSwahili, toolCall,
    )
  }

  // Groq rate-limited AND user seems to have provided details → extraction fallback
  const combined = [...history, { role: 'user' as const, content: message }]
  const hasAdmission = combined.some(m => /\b[A-Z]{2,4}\/\d{3,6}|\d{4,8}\b/.test(m.content))
  const hasName      = combined.some(m => m.content.trim().split(/\s+/).length >= 2)

  if (hasAdmission && hasName && !groqChoice) {
    const extracted = await extractDetailsWithFallback(history, message)
    if (extracted?.student_name && extracted?.admission_number) {
      return handleVerification(
        svc, parent, extracted.student_name, extracted.admission_number,
        message, history, isSwahili, null,
      )
    }
  }

  // Groq still prompting the user
  if (groqChoice) {
    return NextResponse.json({
      reply:    groqChoice.message.content?.trim() ??
        "Hi! To get started, I need to verify your identity. Please share your child's full name and admission number.",
      context:  'verification',
      language: isSwahili ? 'sw' : 'en',
      verified: false,
      provider: 'groq',
    })
  }

  // All of Groq rate-limited + no details yet → AI Gateway prompts the parent
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

// ── Shared verification outcome handler ───────────────────────────────────────

async function handleVerification(
  svc: ReturnType<typeof createAdminSupabaseClient>,
  parent: { phone: string; schoolId: string; studentIds: string[]; unauthorized?: null },
  studentName: string,
  admissionNumber: string,
  originalMessage: string,
  history: ConversationMessage[],
  isSwahili: boolean,
  toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } } | null,
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

  // Re-fetch context now that the account is linked
  const { data: newCtx } = await svc
    .rpc('get_parent_context_for_ai', { p_parent_id: parent.phone })

  const schoolName = (newCtx as { school?: { name?: string } })?.school?.name ?? 'the school'
  const term       = String((newCtx as { school?: { term?: string } })?.school?.term ?? '1')
  const year       = String((newCtx as { school?: { year?: string } })?.school?.year ?? new Date().getFullYear())

  const systemPrompt = buildFullContextPrompt(
    newCtx as CtxType, schoolName, term, year, isSwahili,
  )
  const welcomeMsg = `Great, I have been verified. Please greet me warmly and show me a summary of ${result.studentName}'s school status.`

  let reply    = `Welcome! I've linked your account to ${result.studentName} in ${result.className}.`
  let provider = 'none'

  if (toolCall) {
    // Groq tool-response path (proper tool message format)
    try {
      const secondCompletion = await getGroq().chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  300,
        temperature: 0.7,
        messages: [
          { role: 'system',    content: systemPrompt },
          { role: 'user',      content: originalMessage },
          { role: 'assistant' as const, content: '', tool_calls: [{ ...toolCall, type: 'function' as const }] },
          {
            role:         'tool',
            tool_call_id: toolCall.id,
            content:      JSON.stringify({ verified: true, student_name: result.studentName, class_name: result.className }),
          },
          { role: 'user', content: welcomeMsg },
        ],
      })
      reply    = secondCompletion.choices[0]?.message?.content?.trim() ?? reply
      provider = 'groq'
    } catch (err) {
      if (!isRateLimitOrOverload(err)) throw err
      const r = await callWithFallback(systemPrompt, history, welcomeMsg)
      reply    = r.reply
      provider = r.provider
    }
  } else {
    const r = await callWithFallback(systemPrompt, history, welcomeMsg)
    reply    = r.reply
    provider = r.provider
  }

  return NextResponse.json({
    reply,
    context:  'verification',
    language: isSwahili ? 'sw' : 'en',
    verified: true,
    provider,
  })
}

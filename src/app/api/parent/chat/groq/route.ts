// POST /api/parent/chat/groq
// Body: { message, conversationHistory? }
// If parent has linked students → full context chat.
// If parent has NO linked students → Groq asks for student name + admission number,
//   calls verify_parent tool, links account, then serves full context.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

let _groq: Groq | null = null
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' })
  return _groq
}

type ConversationMessage = { role: 'user' | 'assistant'; content: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CtxType = any

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

function buildFullContextPrompt(ctx: CtxType, schoolName: string, term: string, year: string, isSwahili: boolean) {
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

// Inline verification logic (mirrors verify-by-details route)
async function runVerification(
  svc: ReturnType<typeof createAdminSupabaseClient>,
  parentIdentifier: string,
  schoolId:         string,
  studentName:      string,
  admissionNumber:  string,
): Promise<
  | { verified: true;  studentId: string; studentName: string; className: string }
  | { verified: false; reason: string }
> {
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name, parent_email, parent_phone')
    .eq('school_id', schoolId)
    .ilike('admission_number', admissionNumber.trim())
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

  // Fetch parent context
  const { data: ctx, error: ctxErr } = await svc
    .rpc('get_parent_context_for_ai', { p_parent_id: parent.phone })

  if (ctxErr) {
    return NextResponse.json({ error: 'Context unavailable' }, { status: 502 })
  }

  const children   = (ctx as { children?: unknown[] } | null)?.children
  const hasContext = Array.isArray(children) && children.length > 0
  const isSwahili  = detectLanguage(message) === 'sw'
  const history: ConversationMessage[] = (body.conversationHistory ?? []).slice(-10)

  // ── Verified parent — existing behaviour ─────────────────────────────────────
  if (hasContext) {
    const schoolName = (ctx as { school?: { name?: string } }).school?.name ?? 'the school'
    const term       = String((ctx as { school?: { term?: string } }).school?.term ?? '1')
    const year       = String((ctx as { school?: { year?: string } }).school?.year ?? new Date().getFullYear())

    const completion = await getGroq().chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  300,
      temperature: 0.7,
      messages: [
        { role: 'system', content: buildFullContextPrompt(ctx, schoolName, term, year, isSwahili) },
        ...history,
        { role: 'user', content: message },
      ],
    })

    const reply     = completion.choices[0]?.message?.content?.trim() ?? ''
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
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ reply, context, language: isSwahili ? 'sw' : 'en' })
  }

  // ── Unverified parent — identity verification flow ───────────────────────────
  const verifyTool = {
    type: 'function' as const,
    function: {
      name:        'verify_parent',
      description: 'Verify parent identity using student details provided by the parent',
      parameters: {
        type:       'object',
        properties: {
          student_name:     { type: 'string', description: "Child's full name" },
          admission_number: { type: 'string', description: "Child's admission number" },
        },
        required: ['student_name', 'admission_number'],
      },
    },
  }

  const firstCompletion = await getGroq().chat.completions.create({
    model:        'llama-3.3-70b-versatile',
    max_tokens:   200,
    temperature:  0.5,
    tools:        [verifyTool],
    tool_choice:  'auto',
    messages: [
      { role: 'system', content: buildVerificationPrompt() },
      ...history,
      { role: 'user', content: message },
    ],
  })

  const firstChoice = firstCompletion.choices[0]

  // Groq wants to call the verify_parent tool
  if (
    firstChoice.finish_reason === 'tool_calls' &&
    firstChoice.message.tool_calls?.[0]?.function?.name === 'verify_parent'
  ) {
    const toolCall = firstChoice.message.tool_calls[0]
    let args: { student_name?: string; admission_number?: string } = {}
    try { args = JSON.parse(toolCall.function.arguments) } catch { /* ignore */ }

    const studentName     = args.student_name     ?? ''
    const admissionNumber = args.admission_number ?? ''

    const result = await runVerification(svc, parent.phone, parent.schoolId, studentName, admissionNumber)

    if (!result.verified) {
      const errMsg = result.reason === 'already_linked'
        ? "I found that student but their account is already linked to another parent. Please contact the school office for help."
        : "I couldn't find that student in our records. Please double-check the full name and admission number, then try again."

      return NextResponse.json({
        reply:    errMsg,
        context:  'verification',
        language: 'en',
        verified: false,
      })
    }

    // Verified — re-fetch context and answer properly
    const { data: newCtx } = await svc
      .rpc('get_parent_context_for_ai', { p_parent_id: parent.phone })

    const schoolName = (newCtx as { school?: { name?: string } })?.school?.name ?? 'the school'
    const term       = String((newCtx as { school?: { term?: string } })?.school?.term ?? '1')
    const year       = String((newCtx as { school?: { year?: string } })?.school?.year ?? new Date().getFullYear())

    // Build second call with tool result + verified context
    const secondCompletion = await getGroq().chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  300,
      temperature: 0.7,
      messages: [
        { role: 'system', content: buildFullContextPrompt(newCtx, schoolName, term, year, isSwahili) },
        { role: 'user',   content: message },
        { role: 'assistant', content: null as unknown as string, tool_calls: [toolCall] },
        {
          role:         'tool',
          tool_call_id: toolCall.id,
          content:      JSON.stringify({ verified: true, student_name: result.studentName, class_name: result.className }),
        },
        { role: 'user', content: 'Great, I have been verified. Please greet me and show me my child\'s school summary.' },
      ],
    })

    return NextResponse.json({
      reply:    secondCompletion.choices[0]?.message?.content?.trim() ?? `Welcome! I've linked your account to ${result.studentName} in ${result.className}.`,
      context:  'verification',
      language: isSwahili ? 'sw' : 'en',
      verified: true,
    })
  }

  // Groq is still asking the parent for details (no tool call yet)
  return NextResponse.json({
    reply:    firstChoice.message.content?.trim() ?? "Hi! To get started, I'll need to verify your identity. Could you please provide your child's full name and admission number?",
    context:  'verification',
    language: isSwahili ? 'sw' : 'en',
    verified: false,
  })
}

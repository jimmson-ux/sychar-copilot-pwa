// POST /api/parent/chat
// Body: { studentId, message, language? }
// Claude with full student context; detects English/Swahili; logs to parent_query_logs;
// inserts AI reply into parent_messages for Realtime delivery.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const MODEL = 'claude-haiku-4-5-20251001'

function detectLanguage(text: string): 'sw' | 'en' {
  const swahiliWords = /\b(habari|mtoto|shule|malipo|ada|damu|mwalimu|darasa|hesabu|jibu|tafadhali|asante|karibu|sawa)\b/i
  return swahiliWords.test(text) ? 'sw' : 'en'
}

function classifyContext(message: string): string {
  const lower = message.toLowerCase()
  if (/fee|balance|payment|ada|malipo|paybill/.test(lower)) return 'fee'
  if (/attend|absent|present|school|siku/.test(lower)) return 'attendance'
  if (/mark|grade|exam|result|alama|mtihani/.test(lower)) return 'marks'
  if (/discipline|suspend|behavior|tabia/.test(lower)) return 'discipline'
  if (/clinic|sick|nurse|health|mgonjwa/.test(lower)) return 'clinic'
  return 'general'
}

function detectSentiment(message: string): 'concerned' | 'neutral' | 'positive' {
  const lower = message.toLowerCase()
  if (/worried|concern|problem|urgent|failed|absent|suspend|sick|stress|angry|why/.test(lower)) return 'concerned'
  if (/thank|good|great|happy|improve|pass|excellent|well done/.test(lower)) return 'positive'
  return 'neutral'
}

export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({})) as {
    studentId?: string
    message?:   string
    language?:  string
  }

  if (!body.studentId || !body.message?.trim()) {
    return NextResponse.json({ error: 'studentId and message required' }, { status: 400 })
  }

  if (!parent.studentIds.includes(body.studentId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const svc       = createAdminSupabaseClient()
  const studentId = body.studentId
  const message   = body.message.trim()
  const lang      = body.language ?? detectLanguage(message)

  // Fetch full student context in parallel
  const [
    { data: student },
    { data: balance },
    { data: recentMarks },
    { data: recentAttendance },
    { data: school },
  ] = await Promise.all([
    svc.from('students')
      .select('full_name, class_name, current_form, admission_no, stream')
      .eq('id', studentId)
      .eq('school_id', parent.schoolId)
      .maybeSingle(),

    svc.from('fee_balances')
      .select('current_balance, last_payment_at')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .maybeSingle(),

    svc.from('marks')
      .select('score, percentage, grade, exam_type, term, academic_year, subjects(name)')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('created_at', { ascending: false })
      .limit(10),

    svc.from('attendance_records')
      .select('date, status')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .order('date', { ascending: false })
      .limit(14),

    svc.from('schools')
      .select('name, paybill_number')
      .eq('id', parent.schoolId)
      .maybeSingle(),
  ])

  type StudentRow    = { full_name: string; class_name: string | null; current_form: string | null; admission_no: string | null; stream: string | null }
  type BalanceRow    = { current_balance: number | null; last_payment_at: string | null }
  type SchoolRow     = { name: string; paybill_number: string | null }

  const st = student  as StudentRow | null
  const ba = balance  as BalanceRow | null
  const sc = school   as SchoolRow  | null

  const attendRows  = (recentAttendance ?? []) as { date: string; status: string }[]
  const presentDays = attendRows.filter(r => r.status === 'present').length
  const attendRate  = attendRows.length ? Math.round((presentDays / attendRows.length) * 100) : null

  const marksSummary = (recentMarks ?? []).slice(0, 5).map(m => {
    const subj = Array.isArray(m.subjects) ? m.subjects[0] : m.subjects
    return `${(subj as { name: string } | null)?.name ?? 'Subject'}: ${m.grade ?? '—'} (${m.percentage ?? '—'}%)`
  }).join(', ')

  const systemPrompt = lang === 'sw'
    ? `Wewe ni msaada wa akili bandia wa shule inayoitwa ${sc?.name ?? 'shule'}. Jibu kwa Kiswahili, kwa upole na ufupi. Toa maelezo ya hali ya mtoto kwa mzazi.`
    : `You are a school AI assistant for ${sc?.name ?? 'the school'}. Reply in English, concisely and warmly. Give the parent clear, helpful information about their child. Never share other students' data.`

  const contextBlock = `
Student: ${st?.full_name ?? 'Unknown'}, Form ${st?.current_form ?? '—'}, ${st?.class_name ?? '—'}
Fee balance: KSh ${ba?.current_balance?.toLocaleString('en-KE') ?? 'N/A'} | Paybill: ${sc?.paybill_number ?? 'N/A'}
Attendance (last 14 days): ${attendRate !== null ? `${attendRate}% present` : 'No data'}
Recent marks: ${marksSummary || 'No recent marks'}
`.trim()

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `${contextBlock}\n\nParent asks: ${message}` },
      ],
    }),
  })

  if (!resp.ok) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
  }

  const ai      = await resp.json()
  const reply   = (ai.content?.[0]?.text ?? '').trim()
  const context = classifyContext(message)
  const sentiment = detectSentiment(message)
  const topics    = [context]

  // Log query for staff visibility
  await svc.from('parent_query_logs').insert({
    school_id:        parent.schoolId,
    parent_phone:     parent.phone,
    student_id:       studentId,
    query_text:       message,
    response_summary: reply.slice(0, 200),
    context_type:     context,
    language:         lang,
    sentiment,
    topics,
  })

  // Deliver reply via parent_messages (Realtime)
  await svc.from('parent_messages').insert({
    parent_id:    parent.phone,
    school_id:    parent.schoolId,
    student_id:   studentId,
    message_body: reply,
    sender_type:  'ai_assistant',
    message_type: context === 'general' ? 'text' : context,
    metadata: { query: message, context, language: lang },
  })

  return NextResponse.json({ reply, context, language: lang })
}

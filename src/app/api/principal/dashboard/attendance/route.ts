import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { streamText, generateText } from 'ai'
import { google } from '@ai-sdk/google'

export const dynamic = 'force-dynamic'

/**
 * GET /api/principal/dashboard/attendance
 *
 * Real-time teacher attendance dashboard for the principal.
 * Returns:
 *   - Today's raw scan data (JSON)
 *   - AI-generated briefing streamed from Claude (fallback: Gemini)
 *
 * ?stream=true  → Server-Sent Events with AI text stream
 * ?stream=false → JSON summary only (default)
 */

const PRINCIPAL_ROLES = new Set([
  'principal', 'deputy_principal', 'deputy_principal_academic',
  'dean_of_studies', 'super_admin',
])

async function fetchTodayData(svc: ReturnType<typeof createAdminSupabaseClient>, schoolId: string) {
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: scans }, { data: school }] = await Promise.all([
    svc
      .from('teacher_attendance_scans')
      .select(
        'id, teacher_name, class_name, subject, status, late_minutes, ' +
        'expected_start, expected_end, scanned_at, last_heartbeat_at, left_early_minutes',
      )
      .eq('school_id', schoolId)
      .eq('scan_date', today)
      .order('scanned_at', { ascending: false }),
    svc.from('schools').select('name').eq('id', schoolId).single(),
  ])

  const allScans = (scans ?? []) as unknown as Array<{
    id: string; teacher_name: string; class_name: string; subject: string
    status: string; late_minutes: number; expected_start: string; expected_end: string
    scanned_at: string; last_heartbeat_at: string | null; left_early_minutes: number | null
  }>

  const stats = {
    total:       allScans.length,
    present:     allScans.filter(s => s.status === 'present').length,
    late:        allScans.filter(s => s.status === 'late').length,
    left_early:  allScans.filter(s => s.status === 'left_early').length,
    absent:      allScans.filter(s => s.status === 'absent').length,
    incomplete:  allScans.filter(s => s.status === 'incomplete').length,
  }

  const issues = allScans.filter(s =>
    ['late', 'left_early', 'absent', 'incomplete'].includes(s.status),
  )

  return {
    school_name: (school as { name: string } | null)?.name ?? 'School',
    date:        today,
    stats,
    issues,
    all_scans:   allScans,
  }
}

function buildPrompt(data: Awaited<ReturnType<typeof fetchTodayData>>): string {
  const { school_name, date, stats, issues } = data
  const pct = stats.total > 0
    ? Math.round((stats.present / stats.total) * 100)
    : 0

  const issueLines = issues.slice(0, 15).map(i => {
    if (i.status === 'late')       return `• ${i.teacher_name} (${i.class_name} – ${i.subject}): arrived ${i.late_minutes} min late`
    if (i.status === 'left_early') return `• ${i.teacher_name} (${i.class_name} – ${i.subject}): left early`
    if (i.status === 'absent')     return `• ${i.teacher_name} (${i.class_name} – ${i.subject}): absent`
    return `• ${i.teacher_name} (${i.class_name} – ${i.subject}): ${i.status}`
  }).join('\n')

  return `You are the AI assistant for the principal of ${school_name}. Today is ${date}.

Lesson attendance summary:
- Total lessons tracked: ${stats.total}
- On time: ${stats.present} (${pct}%)
- Late arrivals: ${stats.late}
- Left early: ${stats.left_early}
- Absent: ${stats.absent}

${issues.length > 0 ? `Issues requiring attention:\n${issueLines}` : 'No attendance issues today.'}

Provide a concise professional briefing (3-5 sentences) for the principal:
1. Overall attendance health today
2. Specific concerns if any (name teachers/classes)
3. One actionable recommendation

Keep it factual, direct, and under 120 words.`
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!PRINCIPAL_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc  = createAdminSupabaseClient()
  const data = await fetchTodayData(svc, auth.schoolId)

  const wantStream = req.nextUrl.searchParams.get('stream') === 'true'

  if (wantStream) {
    const result = streamText({
      model:           google('gemini-2.0-flash'),
      prompt:          buildPrompt(data),
      maxOutputTokens: 200,
    })
    return result.toTextStreamResponse({
      headers: {
        'X-School':  data.school_name,
        'X-Date':    data.date,
        'X-Present': String(data.stats.present),
        'X-Total':   String(data.stats.total),
      },
    })
  }

  // Non-streaming: return JSON + AI summary
  let ai_briefing: string | null = null
  const groqKey = process.env.GROQ_API_KEY
  try {
    if (!groqKey) throw new Error('no key')
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 200, messages: [{ role: 'user', content: buildPrompt(data) }] }),
    })
    if (!groqRes.ok) throw new Error('Groq error')
    const groqData = await groqRes.json() as { choices?: { message: { content: string } }[] }
    ai_briefing = groqData.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    try {
      const { text } = await generateText({ model: google('gemini-2.0-flash'), prompt: buildPrompt(data), maxOutputTokens: 200 })
      ai_briefing = text
    } catch {
      ai_briefing = null
    }
  }

  return NextResponse.json({ ...data, ai_briefing })
}

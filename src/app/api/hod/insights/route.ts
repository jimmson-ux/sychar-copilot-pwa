// GET  /api/hod/insights  – return stored AI insights
// POST /api/hod/insights  – generate new insights via Claude, persist, return
// PATCH /api/hod/insights?id=xxx – mark as actioned

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { fetchHodData } from '@/lib/hodData'
import { corsHeaders, handleCors } from '@/lib/cors'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RawInsight {
  insight_type: string
  severity: 'info' | 'warning' | 'critical'
  subject_id: string | null
  class_id: string | null
  summary: string
  recommendation: string
}

export async function OPTIONS(req: Request) {
  return handleCors(req) || new Response(null, { status: 204 })
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`${ip}:ai`, LIMITS.AI_CHAT.max, LIMITS.AI_CHAT.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: corsHeaders(origin) })

  const sb = getClient()
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { data, error } = await sb
    .from('ai_insights')
    .select('id, insight_type, severity, summary, recommendation, subject_id, class_id, generated_at, is_actioned')
    .eq('school_id', auth.schoolId)
    .order('generated_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[hod/insights] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 })
  }
  return NextResponse.json({ insights: data ?? [] })
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`${ip}:ai`, LIMITS.AI_CHAT.max, LIMITS.AI_CHAT.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: corsHeaders(origin) })

  const sb = getClient()
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('[hod/insights] ANTHROPIC_API_KEY not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  try {
    // Fetch HOD data directly (no internal HTTP hop needed — same process)
    const { performance, coverage, streams, subjects } = await fetchHodData(sb, auth.schoolId)

    const streamNames = Object.fromEntries(
      (streams as { id: string; name: string }[]).map(s => [s.id, s.name])
    )
    const subjectNames = Object.fromEntries(
      (subjects as { id: string; name: string }[]).map(s => [s.id, s.name])
    )

    const failingRows = (performance as {
      stream_id: string; subject_id: string; avg_pct: number; fail_rate: number; count: number
    }[])
      .filter(p => p.avg_pct < 50 || p.fail_rate > 40)
      .map(p => ({
        stream:    streamNames[p.stream_id]  ?? p.stream_id,
        subject:   subjectNames[p.subject_id] ?? p.subject_id,
        avg_pct:   p.avg_pct,
        fail_rate: p.fail_rate,
        students:  p.count,
      }))

    const lowCovRows = (coverage as {
      stream_id: string; subject_id: string; coverage_pct: number; topics_total: number
    }[])
      .filter(c => c.coverage_pct < 60 && c.topics_total > 0)
      .map(c => ({
        stream:       streamNames[c.stream_id]  ?? c.stream_id,
        subject:      subjectNames[c.subject_id] ?? c.subject_id,
        coverage_pct: c.coverage_pct,
        topics_total: c.topics_total,
      }))

    const hasData = failingRows.length > 0 || lowCovRows.length > 0 || performance.length > 0

    const prompt = hasData
      ? `You are an academic analytics assistant for a secondary school HOD (Head of Department).

Analyse the following performance and syllabus coverage data and generate 3-6 actionable insights.

## Stream Performance Issues (avg < 50% or fail rate > 40%)
${failingRows.length > 0 ? JSON.stringify(failingRows, null, 2) : 'None detected.'}

## Low Syllabus Coverage (< 60% topics covered)
${lowCovRows.length > 0 ? JSON.stringify(lowCovRows, null, 2) : 'None detected.'}

## All Performance Summary (stream × subject)
${JSON.stringify(
  (performance as { stream_id: string; subject_id: string; avg_pct: number; fail_rate: number; count: number }[])
    .slice(0, 20)
    .map(p => ({
      stream:    streamNames[p.stream_id]  ?? p.stream_id,
      subject:   subjectNames[p.subject_id] ?? p.subject_id,
      avg_pct:   p.avg_pct,
      fail_rate: p.fail_rate,
    })),
  null, 2
)}

Return ONLY a valid JSON object (no markdown, no explanation) with this exact shape:
{
  "insights": [
    {
      "insight_type": "performance_gap" | "syllabus_lag" | "at_risk_stream" | "positive_trend",
      "severity": "info" | "warning" | "critical",
      "subject_id": null,
      "class_id": null,
      "summary": "one sentence describing the finding",
      "recommendation": "one or two sentences on what the HOD should do"
    }
  ]
}`
      : `You are an academic analytics assistant. The school database currently has no marks or syllabus progress data yet.
Generate 3 onboarding insights advising the HOD on how to get started with the system.

Return ONLY valid JSON:
{
  "insights": [
    {
      "insight_type": "setup_guidance",
      "severity": "info",
      "subject_id": null,
      "class_id": null,
      "summary": "brief description",
      "recommendation": "actionable next step"
    }
  ]
}`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      const body = await aiRes.text()
      console.error('[hod/insights] Claude error:', aiRes.status, body.slice(0, 200))
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
    }

    const aiData = await aiRes.json()
    const rawText: string = aiData.content?.[0]?.text ?? ''
    const jsonStr = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: { insights: RawInsight[] }
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('[hod/insights] Claude non-JSON response:', rawText.slice(0, 300))
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 502 })
    }

    if (!Array.isArray(parsed.insights)) {
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 502 })
    }

    const now = new Date().toISOString()
    const rows = parsed.insights.map((ins: RawInsight) => ({
      school_id:      auth.schoolId,
      insight_type:   ins.insight_type   ?? 'general',
      severity:       ins.severity       ?? 'info',
      subject_id:     ins.subject_id     ?? null,
      class_id:       ins.class_id       ?? null,
      student_id:     null,
      summary:        ins.summary        ?? '',
      recommendation: ins.recommendation ?? '',
      generated_at:   now,
      is_actioned:    false,
    }))

    const { data: saved, error: insertErr } = await sb
      .from('ai_insights')
      .insert(rows)
      .select('id, insight_type, severity, summary, recommendation, subject_id, class_id, generated_at, is_actioned')

    if (insertErr) {
      console.error('[hod/insights] Insert error:', insertErr.message)
      return NextResponse.json({ error: 'Failed to save insights' }, { status: 500 })
    }

    return NextResponse.json({ insights: saved ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[hod/insights] POST error:', msg)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/hod/insights?id=xxx  – mark as actioned ───────────────────────

export async function PATCH(req: Request) {
  const sb = getClient()
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await sb
    .from('ai_insights')
    .update({ is_actioned: true })
    .eq('id', id)
    .eq('school_id', auth.schoolId) // scoped to verified school — prevents IDOR

  if (error) {
    console.error('[hod/insights] PATCH error:', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

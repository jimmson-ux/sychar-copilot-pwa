// POST /api/document-inbox
// Uploads a Ministry of Education circular/document, runs Gemini extraction
// then Claude human-readable summary. Stores everything in ministry_circulars.
// Principal ONLY.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type GeminiExtracted = {
  title: string
  circular_number: string
  date: string
  ministry_ref: string
  summary: string
  vote_head_changes: Array<{ head: string; old_rate: number; new_rate: number }>
  policy_changes: Array<{ policy: string; old_value: string; new_value: string }>
  deadlines: Array<{ item: string; date: string }>
  action_required: string
  confidence: number
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  let fileUrl: string
  let source: string
  let rawText: string

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData().catch(() => null)
    if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

    source = String(formData.get('source') ?? 'manual')
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

    // Upload to Supabase Storage
    const db        = svc()
    const bytes     = await file.arrayBuffer()
    const buffer    = new Uint8Array(bytes)
    const ext       = file.name.split('.').pop() ?? 'pdf'
    const path      = `${auth.schoolId}/circulars/${Date.now()}.${ext}`

    const { error: upErr } = await db.storage
      .from('document-inbox')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (upErr) {
      console.error('[document-inbox] upload error:', upErr.message)
      return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
    }

    const { data: { publicUrl } } = db.storage.from('document-inbox').getPublicUrl(path)
    fileUrl = publicUrl

    // For Gemini: read file as base64
    rawText = Buffer.from(bytes).toString('base64')
  } else {
    // JSON body with url + source
    const body = await req.json().catch(() => null) as {
      url: string
      source?: string
    } | null

    if (!body?.url) return NextResponse.json({ error: 'url or file required' }, { status: 400 })
    fileUrl = body.url
    source  = body.source ?? 'manual'

    // Fetch remote file for base64
    try {
      const fileRes = await fetch(fileUrl)
      const bytes   = await fileRes.arrayBuffer()
      rawText       = Buffer.from(bytes).toString('base64')
    } catch (e) {
      console.error('[document-inbox] fetch url error:', e)
      return NextResponse.json({ error: 'Failed to fetch document from URL' }, { status: 400 })
    }
  }

  // ── Gemini extraction ─────────────────────────────────────────────────────
  let geminiExtracted: GeminiExtracted | null = null
  let confidence = 0

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '')
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const extractPrompt = `This is a Kenyan Ministry of Education circular or official document.
Extract the following as JSON:
{
  "title": string,
  "circular_number": string,
  "date": string,
  "ministry_ref": string,
  "summary": string,
  "vote_head_changes": [{"head": string, "old_rate": number, "new_rate": number}],
  "policy_changes": [{"policy": string, "old_value": string, "new_value": string}],
  "deadlines": [{"item": string, "date": string}],
  "action_required": string,
  "confidence": number
}
Return ONLY valid JSON. If a field is not present, use an empty string or empty array.
Document (base64 encoded): ${rawText.slice(0, 50000)}`

    const result = await model.generateContent(extractPrompt)
    const text   = result.response.text()

    // Strip markdown code fences if present
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as GeminiExtracted
      geminiExtracted = parsed
      confidence      = parsed.confidence ?? 0
    }
  } catch (e) {
    console.error('[document-inbox] Gemini error:', e)
    // Non-fatal — continue with Claude summary
  }

  // ── Claude human-readable summary ─────────────────────────────────────────
  let claudeSummary = ''

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const contextText = geminiExtracted
      ? `Title: ${geminiExtracted.title}\nCircular: ${geminiExtracted.circular_number}\nDate: ${geminiExtracted.date}\nSummary: ${geminiExtracted.summary}\nAction Required: ${geminiExtracted.action_required}\nDeadlines: ${JSON.stringify(geminiExtracted.deadlines)}`
      : `Document URL: ${fileUrl}`

    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role:    'user',
        content: `Summarize this Kenyan Ministry of Education document for a school principal. Be specific about what action is required and by when. Max 150 words.\n\n${contextText}`,
      }],
    })

    claudeSummary = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch (e) {
    console.error('[document-inbox] Claude error:', e)
  }

  // ── Persist to ministry_circulars table ───────────────────────────────────
  const db = svc()
  const { data: record, error: insertErr } = await db.from('ministry_circulars').insert({
    school_id:         auth.schoolId,
    file_url:          fileUrl,
    source,
    gemini_extracted:  geminiExtracted,
    claude_summary:    claudeSummary,
    confidence_score:  confidence,
    status:            'pending_review',
    uploaded_by:       auth.userId,
  }).select('id, status').single()

  if (insertErr) {
    console.error('[document-inbox] insert error:', insertErr.message)
    return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 })
  }

  type RecordRow = { id: string; status: string }
  const r = record as RecordRow

  const proposedChanges = [
    ...(geminiExtracted?.vote_head_changes ?? []).map(c => ({
      type:    'vote_head_rate',
      details: `${c.head}: ${c.old_rate} → ${c.new_rate}`,
    })),
    ...(geminiExtracted?.policy_changes ?? []).map(c => ({
      type:    'policy',
      details: `${c.policy}: ${c.old_value} → ${c.new_value}`,
    })),
    ...(geminiExtracted?.deadlines ?? []).map(d => ({
      type:    'deadline',
      details: `${d.item} by ${d.date}`,
    })),
  ]

  return NextResponse.json({
    documentId:       r.id,
    status:           r.status,
    geminiExtracted,
    claudeSummary,
    confidence,
    proposedChanges,
  }, { status: 201 })
}

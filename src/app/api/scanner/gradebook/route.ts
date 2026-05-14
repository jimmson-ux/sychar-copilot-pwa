// POST /api/scanner/gradebook
// Claude Vision OCR for handwritten mark sheets.
// Returns [{admission_number, raw_score, extraction_confidence}]

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const GRADEBOOK_PROMPT =
  'Extract all student marks from this handwritten grade sheet. ' +
  'Return ONLY valid JSON: { "students": [{ "admission_number": "", "raw_score": 0, "extraction_confidence": 0.0 }] }. ' +
  'Use extraction_confidence between 0.0 (unreadable) and 1.0 (certain). No markdown.'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`${ip}:gradebook-ocr`, LIMITS.OCR_SCANNER.max, LIMITS.OCR_SCANNER.window)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })
  }

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  let body: { base64?: string; mimeType?: string; className?: string; subject?: string } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { base64, mimeType, className = '', subject = '' } = body
  if (!base64 || !mimeType) {
    return NextResponse.json({ success: false, error: 'base64 and mimeType required' }, { status: 400 })
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
    return NextResponse.json({ success: false, error: 'Unsupported image type' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ success: false, error: 'OCR service not configured — contact support' }, { status: 503 })
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: GRADEBOOK_PROMPT },
          ],
        }],
        generationConfig: { response_mime_type: 'application/json' },
      }),
    }
  )

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('[gradebook-ocr] Gemini error:', geminiRes.status, errText.slice(0, 200))
    return NextResponse.json({ success: false, error: 'OCR service unavailable' }, { status: 502 })
  }

  const geminiData = await geminiRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let parsedData: { students?: Array<{ admission_number: string; raw_score: number; extraction_confidence: number }> }
  try {
    parsedData = JSON.parse(cleanText)
  } catch {
    parsedData = { students: [] }
  }

  const db = svc()
  const { data: inbox, error: inboxError } = await db
    .from('document_inbox')
    .insert({
      school_id:          auth.schoolId,
      uploaded_by:        auth.userId,
      document_type:      'gradebook',
      raw_extracted_json: { ...parsedData, className, subject },
      status:             'processed',
      scanned_at:         new Date().toISOString(),
    })
    .select('id')
    .single()

  if (inboxError) {
    console.error('[gradebook-ocr] document_inbox insert error:', inboxError.message)
  }

  return NextResponse.json(
    { success: true, students: parsedData.students ?? [], inboxId: inbox?.id ?? null },
    { headers: { 'Access-Control-Allow-Origin': origin ?? '*' } }
  )
}

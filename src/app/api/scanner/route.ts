import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { ScannerOcrSchema } from '@/lib/scannerSchemas'
import { corsHeaders, handleCors } from '@/lib/cors'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Gemini prompts per document type ─────────────────────────────────────────

const GEMINI_PROMPTS: Record<string, string> = {
  'apology-letter':
    'Extract from this apology letter: student_name, admission_number, class, date, reason_for_apology, witness_teacher. Return ONLY valid JSON, no markdown.',
  'class-mark-sheet':
    'Extract all student data. Return ONLY valid JSON: { "students": [{ "name": "", "admission_no": "", "scores": {} }] }. No markdown.',
  'student-photo':
    'Is this a clear passport-style photo for a student ID? Return ONLY valid JSON: { "is_valid": true, "reason": "", "quality": "good/acceptable/poor" }. No markdown.',
  'fee-receipt':
    'Extract: student_name, admission_number, amount_paid, date, receipt_number, payment_method, term. Return ONLY valid JSON, no markdown.',
  'mpesa-screenshot':
    'Extract: transaction_id, amount, sender_name, recipient_name, date, time, balance_after. Return ONLY valid JSON, no markdown.',
  'fee-schedule':
    'Extract all fee items. Return ONLY valid JSON: { "items": [{ "description": "", "amount": 0, "due_date": "", "term": "" }] }. No markdown.',
  'hod-report':
    'Extract: title, date, department, attendees (array), key_points (array), action_items (array), next_meeting_date. Return ONLY valid JSON, no markdown.',
  'official-letter':
    'Extract: sender, recipient, date, subject, reference_number, key_points (array). Return ONLY valid JSON, no markdown.',
  'any-document':
    'Analyze this document. Extract: document_type, date, key_people (array), main_topic, key_information (array), action_required. Return ONLY valid JSON, no markdown.',
}

export async function OPTIONS(req: Request) {
  return handleCors(req) || new Response(null, { status: 204 })
}

// ── POST /api/scanner ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`${ip}:ocr`, LIMITS.OCR_SCANNER.max, LIMITS.OCR_SCANNER.window)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429, headers: corsHeaders(origin) })
  }

  const supabase = getClient()
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  // 2. Validate and whitelist the request body
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ScannerOcrSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { base64, mimeType, documentType } = parsed.data

  // 3. Call Gemini
  const prompt = GEMINI_PROMPTS[documentType] ?? GEMINI_PROMPTS['any-document']

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { response_mime_type: 'application/json' },
      }),
    }
  )

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('[scanner] Gemini error:', geminiRes.status, errText.slice(0, 200))
    return NextResponse.json({ success: false, error: 'OCR service unavailable' }, { status: 502 })
  }

  const geminiData = await geminiRes.json()
  const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let parsedData: Record<string, unknown>
  try {
    parsedData = JSON.parse(cleanText)
  } catch {
    parsedData = { raw_text: cleanText }
  }

  // 4. Insert to document_inbox — userId and schoolId from verified auth only
  const { data: inbox, error: inboxError } = await supabase
    .from('document_inbox')
    .insert({
      school_id:          auth.schoolId,
      uploaded_by:        auth.userId,
      document_type:      documentType,
      raw_extracted_json: parsedData,
      status:             'processed',
      scanned_at:         new Date().toISOString(),
    })
    .select('id')
    .single()

  if (inboxError) {
    console.error('[scanner] document_inbox insert error:', inboxError.message)
    // Return extracted data even when DB insert fails
    return NextResponse.json({ success: true, data: parsedData, inboxId: null })
  }

  return NextResponse.json(
    { success: true, data: parsedData, inboxId: inbox.id },
    { headers: corsHeaders(origin) }
  )
}

// Fallback API route used by useOCRScanner when Edge Function is not deployed.
// Calls Gemini directly using the ocr_* task prompts.

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

const GEMINI_PROMPTS: Record<string, string> = {
  ocr_apology_letter: 'Extract from this student apology letter: student_name, admission_number, class, stream, letter_date, offence_committed, apology_statement, parent_signed (boolean), teacher_witness, tone (genuine/reluctant/unclear), confidence (0-1). Return ONLY valid JSON, no markdown.',
  ocr_grade_sheet:    'Extract all student mark sheet data. Return ONLY valid JSON: { "subject_name":null,"class_name":null,"exam_type":null,"term":null,"students":[{"name":"","admission_no":null,"score":null,"grade":null}],"total_students":0,"confidence":0.9 }. No markdown.',
  ocr_fee_receipt:    'Extract fee receipt details: receipt_type, student_name, admission_number, amount_paid, currency, payment_date, payment_time, reference_number, mpesa_transaction_id, paid_by_name, paid_by_phone, term, bank_name, confidence. Return ONLY valid JSON, no markdown.',
  ocr_mpesa_batch:    'Extract M-Pesa transaction: transaction_id, amount, sender_name, sender_phone, recipient_name, date, time, balance_after, confidence. Return ONLY valid JSON, no markdown.',
  ocr_fee_schedule:   'Extract fee schedule: school_name, term, academic_year, form_grade, fee_items (array of {item_name,amount,due_date,mandatory,notes}), total_fees, issued_by, issue_date, confidence. Return ONLY valid JSON.',
  ocr_hod_report:     'Extract department report: department, report_type, report_date, hod_name, attendees (array), apologies (array), issues_raised (array of {issue,raised_by,status}), action_items (array of {action,assigned_to,deadline,status}), next_meeting_date, any_other_business, confidence. Return ONLY valid JSON.',
  ocr_official_letter:'Extract letter details: letter_type, sender_name, sender_organization, recipient_name, recipient_organization, date, reference_number, subject, key_points (array), action_required, deadline, confidential (boolean), confidence. Return ONLY valid JSON.',
}

const ALLOWED_TASKS = new Set(Object.keys(GEMINI_PROMPTS))

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
])

export async function POST(request: Request) {
  // 1. Verify session
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  // 2. Parse body
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const body = rawBody as Record<string, unknown>
  const { base64, mimeType, task } = body

  if (typeof base64 !== 'string' || base64.length === 0) {
    return NextResponse.json({ success: false, error: 'base64 must be a non-empty string' }, { status: 400 })
  }
  if (base64.length > 11_000_000) {
    return NextResponse.json({ success: false, error: 'Image too large (max ~8 MB)' }, { status: 413 })
  }
  if (typeof task !== 'string' || !ALLOWED_TASKS.has(task)) {
    return NextResponse.json({ success: false, error: 'Invalid task' }, { status: 400 })
  }
  const resolvedMime = typeof mimeType === 'string' && ALLOWED_MIME_TYPES.has(mimeType)
    ? mimeType
    : 'image/jpeg'

  // 3. Call Gemini
  const prompt = GEMINI_PROMPTS[task]

  let geminiRes: Response
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: resolvedMime, data: base64 } },
            { text: prompt },
          ]}],
          generationConfig: { response_mime_type: 'application/json', temperature: 0.1 },
        }),
      }
    )
  } catch {
    console.error('[scanner/process] Gemini fetch failed')
    return NextResponse.json({ success: false, error: 'OCR service unavailable' }, { status: 502 })
  }

  if (!geminiRes.ok) {
    console.error('[scanner/process] Gemini error:', geminiRes.status)
    return NextResponse.json({ success: false, error: 'OCR service unavailable' }, { status: 502 })
  }

  const geminiData = await geminiRes.json()
  const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(cleanText) } catch { parsed = { raw_text: cleanText } }

  return NextResponse.json({
    success: true,
    data: parsed,
    confidence: parsed.confidence ?? null,
    task,
  })
}

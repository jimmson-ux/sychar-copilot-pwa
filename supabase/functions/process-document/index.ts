import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── CORS ──────────────────────────────────────────────────────────────────────
// Origin is locked to the deployed app URL via ALLOWED_ORIGIN env var.
// Falls back to localhost for local development only.
const ALLOWED_ORIGIN = Deno.env.get('APP_URL') ?? 'http://localhost:3000'

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const corsJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// ── Gemini prompts ────────────────────────────────────────────────────────────

const GEMINI_PROMPTS: Record<string, string> = {
  ocr_apology_letter: `You are reading a student apology letter from a Kenyan secondary school.
Extract ALL of the following fields. If a field is not visible, return null for that field.
Return ONLY a JSON object with these exact keys:
{
  "student_name": null,
  "admission_number": null,
  "class": null,
  "stream": null,
  "letter_date": null,
  "offence_committed": null,
  "apology_statement": null,
  "parent_signed": false,
  "teacher_witness": null,
  "tone": "genuine",
  "confidence": 0.9
}
No markdown. No explanation. JSON only.`,

  ocr_grade_sheet: `You are reading a physical mark sheet or mark book page from a Kenyan secondary school.
Extract ALL student records visible. Match the subject column headers carefully.
Return ONLY a JSON object:
{
  "subject_name": null,
  "class_name": null,
  "exam_type": null,
  "term": null,
  "students": [
    { "name": "", "admission_no": null, "score": null, "grade": null, "remarks": null }
  ],
  "total_students": 0,
  "confidence": 0.9
}
No markdown. No explanation. JSON only.`,

  ocr_fee_receipt: `You are reading a fee receipt or M-Pesa payment screenshot from a Kenyan school.
Return ONLY a JSON object:
{
  "receipt_type": "school_receipt",
  "student_name": null,
  "admission_number": null,
  "amount_paid": null,
  "currency": "KES",
  "payment_date": null,
  "payment_time": null,
  "reference_number": null,
  "mpesa_transaction_id": null,
  "paid_by_name": null,
  "paid_by_phone": null,
  "term": null,
  "bank_name": null,
  "confidence": 0.9
}
No markdown. No explanation. JSON only.`,

  ocr_mpesa_batch: `You are reading an M-Pesa payment confirmation message or screenshot.
Extract the payment details for ONE transaction.
Return ONLY a JSON object:
{
  "transaction_id": null,
  "amount": null,
  "sender_name": null,
  "sender_phone": null,
  "recipient_name": null,
  "date": null,
  "time": null,
  "balance_after": null,
  "confidence": 0.9
}
No markdown. No explanation. JSON only.`,

  ocr_fee_schedule: `You are reading a school fee structure circular or fee schedule document from a Kenyan school.
Return ONLY a JSON object:
{
  "school_name": null,
  "term": null,
  "academic_year": null,
  "form_grade": null,
  "fee_items": [
    { "item_name": "", "amount": null, "due_date": null, "mandatory": true, "notes": null }
  ],
  "total_fees": null,
  "issued_by": null,
  "issue_date": null,
  "confidence": 0.9
}
No markdown. No explanation. JSON only.`,

  ocr_hod_report: `You are reading a department meeting report or minutes document from a Kenyan secondary school.
Return ONLY a JSON object:
{
  "department": null,
  "report_type": "meeting_minutes",
  "report_date": null,
  "hod_name": null,
  "attendees": [],
  "apologies": [],
  "issues_raised": [
    { "issue": "", "raised_by": null, "status": "pending" }
  ],
  "action_items": [
    { "action": "", "assigned_to": null, "deadline": null, "status": "pending" }
  ],
  "next_meeting_date": null,
  "any_other_business": null,
  "confidence": 0.9
}
No markdown. No explanation. JSON only.`,

  ocr_official_letter: `You are reading an official letter or correspondence from or to a Kenyan secondary school.
Return ONLY a JSON object:
{
  "letter_type": "incoming",
  "sender_name": null,
  "sender_organization": null,
  "recipient_name": null,
  "recipient_organization": null,
  "date": null,
  "reference_number": null,
  "subject": null,
  "key_points": [],
  "action_required": null,
  "deadline": null,
  "confidential": false,
  "confidence": 0.9
}
No markdown. No explanation. JSON only.`,
}

const ALLOWED_TASKS = new Set(Object.keys(GEMINI_PROMPTS))

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
])

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  // ── 1. Verify JWT ───────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return corsJson({ error: 'Unauthorized' }, 401)
  }

  // Validate the token via Supabase Auth (server-side verification, not local decode)
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) {
    return corsJson({ error: 'Unauthorized' }, 401)
  }

  // ── 2. Derive schoolId server-side — never trust the request body ───────────
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: staff } = await serviceClient
    .from('staff_records')
    .select('school_id')
    .eq('user_id', user.id)
    .single()

  if (!staff?.school_id) {
    return corsJson({ error: 'Forbidden: no staff record found' }, 403)
  }

  // ── 3. Parse and validate the request body ──────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return corsJson({ error: 'Invalid JSON body' }, 400)
  }

  const { base64, mimeType, task } = body as {
    base64?: unknown
    mimeType?: unknown
    task?: unknown
  }

  if (typeof base64 !== 'string' || base64.length === 0) {
    return corsJson({ error: 'base64 must be a non-empty string' }, 400)
  }
  if (base64.length > 11_000_000) {
    return corsJson({ error: 'Image too large (max ~8 MB)' }, 413)
  }
  if (typeof task !== 'string' || !ALLOWED_TASKS.has(task)) {
    return corsJson({ error: `Unknown task: ${task}` }, 400)
  }
  const resolvedMime = typeof mimeType === 'string' && ALLOWED_MIME_TYPES.has(mimeType)
    ? mimeType
    : 'image/jpeg'

  // ── 4. Call Gemini ──────────────────────────────────────────────────────────
  const prompt = GEMINI_PROMPTS[task]

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: resolvedMime, data: base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1,
        },
      }),
    }
  )

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    console.error('[process-document] Gemini error:', geminiRes.status, errText.slice(0, 200))
    return corsJson({ error: 'OCR service unavailable' }, 502)
  }

  const geminiData = await geminiRes.json()
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleanText)
  } catch {
    parsed = { raw_text: cleanText }
  }

  // ── 5. Log the scan — using server-derived ids only ─────────────────────────
  await serviceClient.from('ocr_log').insert({
    task,
    school_id: staff.school_id,
    user_id:   user.id,
    confidence: parsed.confidence ?? null,
    success:   true,
  })

  return corsJson({ success: true, data: parsed, confidence: parsed.confidence ?? null, task })
})

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from '../_shared/cors.ts'

const corsJson = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })

// ── Gemini prompts ────────────────────────────────────────────────────────────

const GEMINI_PROMPTS: Record<string, string> = {
  invoice: `You are reading a supplier invoice or delivery note from Kenya. Extract ALL information carefully.
Return ONLY valid JSON — no markdown, no explanation:
{
  "document_type": "invoice",
  "document_number": "",
  "document_date": "YYYY-MM-DD or null",
  "supplier": {
    "name": "",
    "phone": "",
    "email": "",
    "pin_number": "",
    "address": ""
  },
  "school_name": "",
  "items": [
    { "item_name": "", "unit": "", "quantity": 0, "unit_price_kes": 0, "total_price_kes": 0 }
  ],
  "subtotal_kes": 0,
  "tax_kes": 0,
  "total_kes": 0,
  "payment_terms": "",
  "notes": "",
  "confidence": 0.0,
  "warnings": []
}
IMPORTANT RULES:
- All prices in KES as numbers (remove commas: 1,250.00 → 1250)
- unit: standardise to: pcs, boxes, reams, litres, kg, pairs, sets
- If any field is unclear, include it in warnings array
- confidence: your overall confidence 0.0-1.0
- If this is BOTH invoice AND delivery note, set document_type to invoice`,

  delivery_note: `You are reading a delivery note (LPO receipt) from a Kenyan supplier.
Return identical JSON structure as the invoice prompt. Focus on quantities delivered and any shortages.
Return ONLY valid JSON — no markdown, no explanation.`,

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

  ocr_aie_form: `You are processing a Kenya government AIE (Authority to Incur Expenditure) form from a secondary school.
Extract all line items and metadata. Return ONLY a JSON object:
{
  "form_number": null,
  "vote_head": null,
  "department": null,
  "prepared_by": null,
  "date": null,
  "items": [
    { "item_name": "", "unit": "", "quantity": 0, "unit_cost": 0, "total": 0 }
  ],
  "total_amount": null,
  "confidence": 0.9
}
Rules:
- "date" must be in YYYY-MM-DD format or null
- "quantity" and "unit_cost" must be numbers (not strings)
- Extract every line item visible — do not truncate the list
- If a field is not visible, use null (or 0 for numbers)
No markdown. No explanation. JSON only.`,
}

const ALLOWED_TASKS = new Set(Object.keys(GEMINI_PROMPTS))

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'application/pdf',
])

// ── Procurement document OCR handler ─────────────────────────────────────────
// Called server-to-server from /api/procurement/upload (service role)

async function handleProcurementOCR(
  serviceClient: ReturnType<typeof createClient>,
  documentId: string,
  schoolId: string,
  filePath: string,
  bucket: string,
  origin: string | null
): Promise<Response> {
  try {
    // 1. Fetch file from storage
    const { data: fileData, error: dlErr } = await serviceClient.storage
      .from(bucket)
      .download(filePath)
    if (dlErr || !fileData) {
      console.error('[process-document] download error:', dlErr?.message)
      await serviceClient.from('procurement_documents')
        .update({ ocr_status: 'failed' }).eq('id', documentId)
      return corsJson({ error: 'File download failed' }, 502, origin)
    }

    // 2. Convert to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const bytes       = new Uint8Array(arrayBuffer)
    const chunks: string[] = []
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)))
    }
    const base64   = btoa(chunks.join(''))
    const mimeType = fileData.type || 'image/jpeg'

    // 3. Call Gemini
    const prompt = GEMINI_PROMPTS['invoice']
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ]}],
          generationConfig: { response_mime_type: 'application/json', temperature: 0.1 },
        }),
      }
    )

    let parsed: Record<string, unknown> = {}
    if (geminiRes.ok) {
      const gd = await geminiRes.json()
      const rawText  = gd.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
      const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      try { parsed = JSON.parse(cleanText) } catch { parsed = { raw_text: cleanText } }
    } else {
      console.error('[process-document] Gemini error:', geminiRes.status)
    }

    // 4. Find or create supplier
    let supplierId: string | null = null
    const supplierRaw = parsed.supplier as Record<string, string> | null
    if (supplierRaw?.name) {
      const normName = supplierRaw.name.toLowerCase().trim().replace(/\s+/g, ' ')
      const { data: existingSupplier } = await serviceClient
        .from('suppliers')
        .upsert({
          school_id:       schoolId,
          name:            supplierRaw.name,
          normalised_name: normName,
          phone:           supplierRaw.phone ?? null,
          email:           supplierRaw.email ?? null,
          pin_number:      supplierRaw.pin_number ?? null,
          physical_address: supplierRaw.address ?? null,
        }, { onConflict: 'school_id,normalised_name' })
        .select('id')
        .single()
      supplierId = (existingSupplier as { id?: string } | null)?.id ?? null
    }

    // 5. Update procurement document
    const parsedDate  = typeof parsed.document_date === 'string' ? parsed.document_date : null
    const parsedTotal = typeof parsed.total_kes === 'number' ? parsed.total_kes : null
    const parsedTax   = typeof parsed.tax_kes   === 'number' ? parsed.tax_kes   : null
    const warnings    = Array.isArray(parsed.warnings) ? parsed.warnings : []

    await serviceClient.from('procurement_documents').update({
      ocr_status:          'completed',
      ocr_confidence:      parsed.confidence ?? null,
      raw_ocr_text:        JSON.stringify(parsed),
      extracted_date:      parsedDate,
      extracted_total_kes: parsedTotal,
      extracted_tax_kes:   parsedTax,
      extraction_warnings: warnings,
      supplier_id:         supplierId,
      supplier_name:       supplierRaw?.name ?? null,
      document_number:     parsed.document_number ?? null,
      workflow_status:     'ocr_complete',
    }).eq('id', documentId)

    // 6. Insert line items
    const items = Array.isArray(parsed.items) ? parsed.items as Record<string, unknown>[] : []
    if (items.length > 0) {
      await serviceClient.from('procurement_line_items').insert(
        items.map(item => ({
          school_id:         schoolId,
          document_id:       documentId,
          item_name:         String(item.item_name ?? ''),
          unit:              item.unit ? String(item.unit) : null,
          quantity_invoiced: Number(item.quantity) || 0,
          unit_price_kes:    Number(item.unit_price_kes) || 0,
          tax_kes:           0,
        }))
      )
    }

    // 7. Notify: flag significant price increases to principal
    const { data: flaggedItems } = await serviceClient
      .from('procurement_line_items')
      .select('item_name, unit_price_kes, last_price_kes, price_variance_pct, price_flag')
      .eq('document_id', documentId)
      .eq('price_flag', 'significant_increase')

    if (flaggedItems && flaggedItems.length > 0) {
      await serviceClient.from('alerts').insert({
        school_id: schoolId,
        type:      'procurement',
        severity:  'warning',
        title:     `⚠️ Price alert: ${flaggedItems.length} item(s) significantly more expensive than last purchase`,
        detail:    {
          document_id: documentId,
          items: (flaggedItems as Record<string, unknown>[]).map(i => ({
            name: i.item_name,
            variance_pct: i.price_variance_pct,
          })),
        },
      })
    }

    return corsJson({
      success:    true,
      documentId,
      itemsFound: items.length,
      confidence: parsed.confidence ?? null,
    }, 200, origin)
  } catch (err) {
    console.error('[process-document] procurement OCR error:', err)
    await serviceClient.from('procurement_documents')
      .update({ ocr_status: 'failed' }).eq('id', documentId).then(() => {}, () => {})
    return corsJson({ error: 'OCR processing failed' }, 500, origin)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  // ── 1. Verify JWT ───────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return corsJson({ error: 'Unauthorized' }, 401, origin)
  }

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) {
    return corsJson({ error: 'Unauthorized' }, 401, origin)
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
    return corsJson({ error: 'Forbidden: no staff record found' }, 403, origin)
  }

  // ── 3. Parse and validate the request body ──────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return corsJson({ error: 'Invalid JSON body' }, 400, origin)
  }

  // ── 3a. Procurement server-to-server path ────────────────────────────────────
  // Invoked by /api/procurement/upload with documentId + filePath + bucket
  if (typeof body.documentId === 'string' && typeof body.filePath === 'string' && typeof body.bucket === 'string') {
    return handleProcurementOCR(
      serviceClient,
      body.documentId,
      staff.school_id,
      body.filePath,
      body.bucket,
      origin,
    )
  }

  const { base64, mimeType, task } = body as {
    base64?: unknown
    mimeType?: unknown
    task?: unknown
  }

  if (typeof base64 !== 'string' || base64.length === 0) {
    return corsJson({ error: 'base64 must be a non-empty string' }, 400, origin)
  }
  if (base64.length > 11_000_000) {
    return corsJson({ error: 'Image too large (max ~8 MB)' }, 413, origin)
  }
  if (typeof task !== 'string' || !ALLOWED_TASKS.has(task)) {
    return corsJson({ error: `Unknown task: ${task}` }, 400, origin)
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
    return corsJson({ error: 'OCR service unavailable' }, 502, origin)
  }

  const geminiData = await geminiRes.json()
  const rawText    = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  const cleanText  = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleanText)
  } catch {
    parsed = { raw_text: cleanText }
  }

  // ── 5. Log the scan — using server-derived ids only ─────────────────────────
  await serviceClient.from('ocr_log').insert({
    task,
    school_id:  staff.school_id,
    user_id:    user.id,
    confidence: parsed.confidence ?? null,
    success:    true,
  })

  return corsJson({ success: true, data: parsed, confidence: parsed.confidence ?? null, task }, 200, origin)
})

// POST /api/store/delivery
// Delivery verification flow:
//   1. Receive delivery_note_url (photo uploaded to Supabase storage by client)
//   2. Send to Google Vision OCR → extract items + quantities from text
//   3. Cross-reference against original requisition (if provided)
//   4. Return extracted data + shortage flags for storekeeper to confirm/correct

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface VisionResponse {
  responses: Array<{
    fullTextAnnotation?: { text: string }
    error?: { message: string }
  }>
}

interface ExtractedItem {
  description: string
  quantity:    number | null
  unit:        string | null
  raw_line:    string
}

// Parse Google Vision text for delivery note items.
// Heuristic: lines matching "<name> <qty> <unit>" or "<qty> <unit> <name>"
function parseDeliveryText(text: string): ExtractedItem[] {
  const lines   = text.split('\n').map(l => l.trim()).filter(Boolean)
  const results: ExtractedItem[] = []

  // Common units seen in Kenyan school delivery notes
  const UNITS = /\b(kg|kgs|g|bags?|sacks?|litres?|ltrs?|l|pcs?|pieces?|boxes?|crates?|dozens?|rolls?|reams?|units?|packs?|pairs?|tins?)\b/i

  for (const line of lines) {
    // Skip header-like lines
    if (/total|invoice|delivery|receipt|supplier|date|no\.|ref|page|sign|authoriz/i.test(line)) continue

    const qtyMatch   = line.match(/\b(\d+(?:\.\d+)?)\b/)
    const unitMatch  = line.match(UNITS)
    const quantity   = qtyMatch ? parseFloat(qtyMatch[1]) : null
    const unit       = unitMatch ? unitMatch[0].toLowerCase() : null

    // Extract description: line minus the qty and unit tokens
    let desc = line
      .replace(qtyMatch?.[0] ?? '', '')
      .replace(unitMatch?.[0] ?? '', '')
      .replace(/[,;:|]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')

    if (desc.length < 2) continue

    results.push({ description: desc, quantity, unit, raw_line: line })
  }

  return results.slice(0, 50) // cap at 50 items
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!['storekeeper', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    delivery_note_url:  string   // public or signed URL of the delivery note photo
    requisition_id?:    string   // to cross-reference expected items
    items_photo_url?:   string   // photo of actual received items
  }

  if (!body.delivery_note_url) {
    return NextResponse.json({ error: 'delivery_note_url required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_VISION_API_KEY not configured' }, { status: 500 })
  }

  // ── Call Google Vision Document Text Detection ────────────────────────────
  const visionRes = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image:    { source: { imageUri: body.delivery_note_url } },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    }
  )

  if (!visionRes.ok) {
    return NextResponse.json({ error: `Google Vision error: ${visionRes.status}` }, { status: 502 })
  }

  const visionData = await visionRes.json() as VisionResponse
  const resp0      = visionData.responses?.[0]

  if (resp0?.error) {
    return NextResponse.json({ error: `Vision API: ${resp0.error.message}` }, { status: 502 })
  }

  const fullText      = resp0?.fullTextAnnotation?.text ?? ''
  const extractedItems = parseDeliveryText(fullText)

  // ── Cross-reference against approved requisition ──────────────────────────
  type Shortage = { expected_item: string; expected_qty: number; received_qty: number | null }
  const shortages: Shortage[] = []

  if (body.requisition_id) {
    const db = svc()
    const { data: reqData } = await db
      .from('requisitions')
      .select('items')
      .eq('id', body.requisition_id)
      .eq('school_id', auth.schoolId!)
      .single()

    if (reqData) {
      type ReqItem = { description: string; quantity: number }
      const reqItems = (reqData as { items: ReqItem[] }).items ?? []

      for (const ri of reqItems) {
        const match = extractedItems.find(ei =>
          ei.description.toLowerCase().includes(ri.description.toLowerCase().slice(0, 6)) ||
          ri.description.toLowerCase().includes(ei.description.toLowerCase().slice(0, 6))
        )
        const received = match?.quantity ?? null
        if (received === null || received < ri.quantity) {
          shortages.push({
            expected_item: ri.description,
            expected_qty:  ri.quantity,
            received_qty:  received,
          })
        }
      }
    }
  }

  return NextResponse.json({
    raw_text:       fullText,
    extracted_items: extractedItems,
    shortages,
    has_shortages:  shortages.length > 0,
    items_photo_url: body.items_photo_url ?? null,
  })
}

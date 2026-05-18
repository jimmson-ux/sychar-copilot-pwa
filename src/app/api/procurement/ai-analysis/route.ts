// POST /api/procurement/ai-analysis — Claude analyses a procurement document
// Returns: price variance summary, supplier assessment, quantity issues, recommendation

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

const ALLOWED = new Set(['accountant', 'principal', 'deputy_principal'])

async function callAI(prompt: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  try {
    if (!groqKey) throw new Error('no key')
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!groqRes.ok) throw new Error('Groq error')
    const groqData = await groqRes.json() as { choices?: { message: { content: string } }[] }
    const text = groqData.choices?.[0]?.message?.content ?? ''
    if (!text) throw new Error('empty')
    return text
  } catch {
    const { text } = await generateText({ model: google('gemini-2.0-flash'), prompt, maxOutputTokens: 800 })
    return text
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { documentId?: string }
  if (!body.documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  const db = createAdminSupabaseClient()

  const { data: doc } = await db
    .from('procurement_documents')
    .select('*, suppliers(*)')
    .eq('id', body.documentId)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: lineItems } = await db
    .from('procurement_line_items')
    .select('*')
    .eq('document_id', body.documentId)

  // Fetch price history for all items in this document
  const itemNames = [...new Set((lineItems ?? []).map(i => (i as { item_name: string }).item_name))]
  const { data: priceHistory } = await db
    .from('procurement_price_history')
    .select('item_name, delivery_date, unit_price_kes, supplier_name')
    .eq('school_id', auth.schoolId!)
    .in('item_name', itemNames.map(n => n.toLowerCase()))
    .order('delivery_date', { ascending: false })

  const prompt = `You are a procurement intelligence analyst for a Kenyan secondary school.
Analyse this delivery/invoice and provide actionable insights.

DOCUMENT DATA:
${JSON.stringify({ ...doc, suppliers: undefined }, null, 2)}

LINE ITEMS (${(lineItems ?? []).length} items):
${JSON.stringify(lineItems, null, 2)}

PRICE HISTORY FOR THESE ITEMS (last 6 months):
${JSON.stringify(priceHistory ?? [], null, 2)}

MARKET CONTEXT:
- School: Nkoroi Mixed Day Senior Secondary School, Kajiado County, Kenya
- Budget source: FDSE (Free Day Secondary Education) government capitation
- Kenya inflation rate 2026: approximately 5-7%
- Items typically include: stationery, lab supplies, cleaning materials, food

ANALYSE AND PROVIDE (be concise — principal reads this in under 2 minutes):

1. PRICE VARIANCE SUMMARY
   For each item, compare to last purchase. Flag suspicious increases (>30% without justification).
   Use specific numbers: "Biro pens: KES 25 vs KES 18 last time (+39%) — investigate"

2. SUPPLIER ASSESSMENT
   Reliability based on delivery history. Are prices competitive?
   Note any delivery discrepancies in this order.

3. QUANTITY ISSUES (if storekeeper found shortages)
   What was short-delivered? Estimated loss in KES. Recommended action.

4. APPROVAL RECOMMENDATION
   Choose exactly one:
   [APPROVE] — everything in order
   [APPROVE WITH CAUTION] — minor issues noted
   [REJECT - RENEGOTIATE] — prices excessive
   [REJECT - INVESTIGATE] — significant shortages or anomalies

5. BUDGET IMPACT
   Total cost in KES. Which vote head(s) to charge.
   One sentence on budget sufficiency.

Use plain English. Use numbers. No generic advice.`

  try {
    const analysis = await callAI(prompt)

    // Store analysis on the document
    await db.from('procurement_documents')
      .update({ ai_analysis: analysis })
      .eq('id', body.documentId)
      .then(() => {}, () => {})

    return NextResponse.json({ analysis, documentId: body.documentId })
  } catch (err) {
    console.error('[procurement/ai-analysis] error:', err)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
  }
}

// POST /api/storekeeper/ai-distribution
// Calls Claude to suggest optimal distribution of approved requisition items.
// Body: { aie_form_id, context? }

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { askAIProvider } from '@/lib/aiProvider'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_ROLES = ['storekeeper', 'principal', 'deputy_principal_admin']

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId, subRole } = auth

  if (!ALLOWED_ROLES.includes(subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { aie_form_id, context } = body as { aie_form_id?: string; context?: string }

  if (!aie_form_id) {
    return NextResponse.json({ error: 'aie_form_id required' }, { status: 400 })
  }

  const db = serviceClient()

  // Fetch items for this form
  const { data: items } = await db
    .from('requisition_items')
    .select('*')
    .eq('aie_form_id', aie_form_id)
    .eq('school_id', schoolId)

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'No items found for this requisition' }, { status: 404 })
  }

  // Fetch staff list (teachers) for the school
  const { data: staff } = await db
    .from('staff_records')
    .select('full_name, sub_role, department')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .in('role', ['teacher', 'hod'])

  const staffSummary = (staff ?? [])
    .map(s => `${s.full_name} (${s.sub_role ?? 'teacher'}${s.department ? ', ' + s.department : ''})`)
    .join('\n')

  const itemsSummary = items
    .map(i => `- ${i.item_name}: ${i.quantity_approved - i.quantity_fulfilled} ${i.unit} remaining (${i.quantity_fulfilled}/${i.quantity_approved} issued)`)
    .join('\n')

  const prompt = `You are a school storekeeper assistant at a Kenyan secondary school.

Available items from approved requisition:
${itemsSummary}

Teaching staff:
${staffSummary}
${context ? `\nAdditional context: ${context}` : ''}

Suggest an optimal distribution plan for these items across the relevant staff members.
Consider:
- Subject teachers should receive materials related to their subject
- HODs should receive department-wide consumables
- Prioritise items with many remaining units

Respond with a JSON object:
{
  "suggestions": [
    {
      "item_name": "string",
      "distributions": [
        { "recipient": "Full Name", "quantity": number, "reason": "brief reason" }
      ]
    }
  ],
  "summary": "one paragraph overview of the distribution plan"
}`

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  let rawText = ''
  try {
    const ai = await askAIProvider('You are a stores & distribution analyst for a Kenyan secondary school.', [{ role: 'user', content: prompt }], 1024)
    rawText = ai.content ?? ''
  } catch { return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 }) }

  let parsed: Record<string, unknown>
  try {
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    parsed = { suggestions: [], summary: rawText }
  }

  return NextResponse.json({ ok: true, ...parsed })
}

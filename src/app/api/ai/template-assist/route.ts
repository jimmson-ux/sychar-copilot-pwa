import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { buildSchoolSystemPrompt } from '@/lib/aiSchoolContext'
import { askAIProvider } from '@/lib/aiProvider'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/template-assist
 *
 * AI fill-assistant for document templates (lesson plan, ROW, TOD, G&C, nurse).
 * Returns a DRAFT suggestion for a single field — it never submits anything; the
 * user reviews and edits. School-aware (boys-only / boarding framing).
 *
 * Body: { docType, fieldLabel, context?: Record<string,unknown>, instruction? }
 */
export async function POST(req: NextRequest) {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    docType?: string; fieldLabel?: string; context?: Record<string, unknown>; instruction?: string
  }
  if (!body.docType || !body.fieldLabel) {
    return NextResponse.json({ error: 'docType and fieldLabel are required' }, { status: 400 })
  }

  const base = `You are a helper that drafts a single field for a Kenyan school document (${body.docType}). ` +
    `Draft ONLY the "${body.fieldLabel}" field. Be concise, professional and curriculum-appropriate ` +
    `(CBC/8-4-4, KICD, TSC/TPAD). For counselling/health content use objective, non-judgmental clinical/welfare language. ` +
    `Return plain text only — no preamble, no headings.`

  try {
    const systemPrompt = await buildSchoolSystemPrompt(auth.schoolId, base)
    const userMsg = `Field to draft: ${body.fieldLabel}\n` +
      (body.instruction ? `Instruction: ${body.instruction}\n` : '') +
      (body.context ? `Context so far: ${JSON.stringify(body.context).slice(0, 2000)}` : '')

    let suggestion = ''
    try {
      const ai = await askAIProvider(systemPrompt, [{ role: 'user', content: userMsg }], 350)
      suggestion = ai.content.trim()
    } catch { return NextResponse.json({ error: 'AI request failed' }, { status: 502 }) }
    return NextResponse.json({ suggestion, draft: true })
  } catch (err) {
    console.error('[ai/template-assist]', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}

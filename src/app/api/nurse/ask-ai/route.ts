import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { buildSchoolSystemPrompt } from '@/lib/aiSchoolContext'
import { retrieveSchoolContext, formatRagContext } from '@/lib/rag'
import { askAIProvider } from '@/lib/aiProvider'

export const dynamic = 'force-dynamic'

/**
 * POST /api/nurse/ask-ai — nurse-facing AI insights (nurse only).
 *
 * Grounds the answer in: current medication stock, recent issuance, and (RAG)
 * the school's nurse notes — for questions about medication issuing, returning
 * patients and previous ailments. School-scoped; no cross-school leakage.
 *
 * Body: { question, student_id? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'nurse') return NextResponse.json({ error: 'Forbidden: nurse only' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { question?: string; student_id?: string }
  if (!body.question?.trim()) return NextResponse.json({ error: 'question required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  // Stock context.
  const { data: meds } = await svc
    .from('nurse_medications')
    .select('name, unit, stock_qty, reorder_level')
    .eq('school_id', auth.schoolId)
    .order('stock_qty', { ascending: true })
    .limit(40)
  const stockLines = (meds as any[] ?? []).map((m) => `${m.name}: ${m.stock_qty} ${m.unit}${Number(m.stock_qty) <= Number(m.reorder_level) ? ' (LOW)' : ''}`)

  // Returning-patient context for a specific student.
  let historyLines: string[] = []
  if (body.student_id) {
    const { data: hist } = await svc
      .from('sick_bay_visits')
      .select('complaint, action_taken, admitted_at')
      .eq('school_id', auth.schoolId)
      .eq('student_id', body.student_id)
      .order('admitted_at', { ascending: false })
      .limit(15)
    historyLines = (hist as any[] ?? []).map((h) => `${(h.admitted_at ?? '').slice(0, 10)}: ${h.complaint} → ${h.action_taken}`)
  }

  // RAG over nurse notes.
  const chunks = await retrieveSchoolContext(auth.schoolId, body.question, { sourceTypes: ['nurse_note'], matchCount: 6 })

  const base = `You are a school nurse's clinical-decision support assistant. Be cautious and practical: advise on medication issuing only against the stock shown, flag low stock and suggest requisitions, surface returning-patient patterns and previous ailments. You are NOT a doctor — recommend referral when unsure. Keep it concise.`
  const systemPrompt = await buildSchoolSystemPrompt(auth.schoolId, base)

  const context = [
    stockLines.length ? `Current medication stock:\n${stockLines.join('\n')}` : '',
    historyLines.length ? `This patient's previous visits:\n${historyLines.join('\n')}` : '',
    formatRagContext(chunks),
  ].filter(Boolean).join('\n\n')

  try {
    // OpenAI (ChatGPT) → Anthropic (Claude) → Groq.
    const { content } = await askAIProvider(
      systemPrompt,
      [{ role: 'user', content: `${context}\n\nNurse question: ${body.question.trim()}` }],
      500,
    )
    return NextResponse.json({ answer: content.trim(), used_stock: stockLines.length, used_history: historyLines.length, used_rag: chunks.length })
  } catch (err) {
    console.error('[nurse/ask-ai]', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}

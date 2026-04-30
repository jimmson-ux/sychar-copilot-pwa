// POST /api/lesson-plans/[id]/generate-ai
// Calls Claude to generate lesson plan content, stores in ai_generated_plan

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const { id } = await params
  const body   = await req.json().catch(() => ({})) as {
    classPerformanceData?: Record<string, unknown>
  }

  const db = createAdminSupabaseClient()

  const { data: plan } = await db
    .from('lesson_plans')
    .select('subject_name, class_name, stream_name, topic, sub_topic, curriculum_type, cbc_strand, cbc_sub_strand, school_id')
    .eq('id', id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const { data: tenant } = await db
    .from('tenant_configs')
    .select('name, curriculum, current_term, current_year')
    .eq('school_id', auth.schoolId)
    .single()

  const curriculum  = plan.curriculum_type ?? tenant?.curriculum ?? '844'
  const performance = body.classPerformanceData
    ? `\nCLASS PERFORMANCE CONTEXT:\n${JSON.stringify(body.classPerformanceData)}`
    : ''

  const prompt = `You are a curriculum specialist helping a Kenyan secondary school teacher write a detailed lesson plan.

SCHOOL: ${(tenant as { name?: string })?.name ?? 'Kenyan Secondary School'}
SUBJECT: ${plan.subject_name}
CLASS: ${plan.class_name}${plan.stream_name ? ' ' + plan.stream_name : ''}
TOPIC: ${plan.topic}${plan.sub_topic ? '\nSUB-TOPIC: ' + plan.sub_topic : ''}
CURRICULUM: ${curriculum === 'CBC' || curriculum === 'both' ? 'CBC (Competency Based Curriculum)' : '8-4-4'}
${plan.cbc_strand ? 'STRAND: ' + plan.cbc_strand : ''}
${plan.cbc_sub_strand ? 'SUB-STRAND: ' + plan.cbc_sub_strand : ''}
TERM: ${tenant?.current_term ?? 2} | YEAR: ${tenant?.current_year ?? '2025/2026'}
${performance}

Write a complete, structured lesson plan with these sections:
1. SPECIFIC OUTCOMES — 3 measurable learning outcomes (use Bloom's taxonomy verbs)
2. LEARNING EXPERIENCES — Step-by-step activities (introduction 5min, development 25min, conclusion 10min)
3. LEARNING RESOURCES — Materials, textbooks (cite Kenyan KICD-approved titles), manipulatives
4. ASSESSMENT METHODS — Formative assessment techniques appropriate for the topic
5. DIFFERENTIATION — How to support struggling learners and extend fast finishers
6. HOMEWORK / FOLLOW-UP — One meaningful task

Keep it practical for a Kenyan classroom context. Be specific about resources and activities.
Format with clear headers. Total length: 350-500 words.`

  const client = new Anthropic({ apiKey: anthropicKey })

  let aiText = ''
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    })
    aiText = (response.content[0] as { text: string }).text ?? ''
  } catch {
    return NextResponse.json({ error: 'AI generation failed' }, { status: 502 })
  }

  await db
    .from('lesson_plans')
    .update({ ai_generated: true, ai_generated_plan: aiText, updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ai_generated_plan: aiText })
}

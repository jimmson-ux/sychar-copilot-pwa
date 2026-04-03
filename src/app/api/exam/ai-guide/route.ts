import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { validateTeacherToken } from '@/lib/validateTeacherToken'

const AiGuideSchema = z.object({
  token:        z.string().min(8),
  className:    z.string().min(1).max(100),
  subjectName:  z.string().min(1).max(100),
  examType:     z.string().min(1).max(50),
  term:         z.enum(['Term 1', 'Term 2', 'Term 3']),
  avg:          z.number().min(0).max(100),
  atRiskCount:  z.number().int().min(0),
  excellingCount: z.number().int().min(0),
  failedTopics: z.array(z.string().max(200)).max(10),
  passedTopics: z.array(z.string().max(200)).max(10),
  scores:       z.array(z.object({
    studentName: z.string().max(100),
    score:       z.number().min(0).max(100),
  })).max(120),
  shareWithHod: z.boolean().optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = AiGuideSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const {
    token, className, subjectName, examType, term,
    avg, atRiskCount, excellingCount, failedTopics, passedTopics, scores,
    shareWithHod,
  } = parsed.data

  const info = await validateTeacherToken(token)
  if (!info) return NextResponse.json({ error: 'Invalid token' }, { status: 403 })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('[exam/ai-guide] ANTHROPIC_API_KEY not set')
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
  }

  // Build student tiers
  const below40 = scores.filter(s => s.score < 40).map(s => `${s.studentName} (${s.score}%)`).slice(0, 10)
  const s40to50 = scores.filter(s => s.score >= 40 && s.score < 50).map(s => `${s.studentName} (${s.score}%)`).slice(0, 10)
  const above80 = scores.filter(s => s.score >= 80).map(s => `${s.studentName} (${s.score}%)`).slice(0, 10)

  const prompt = `You are an expert Kenyan secondary school curriculum advisor.
A ${subjectName} teacher has just marked a ${examType} exam for ${className}.
Here are the results:

Class average: ${avg}%
Top failed topics/questions: ${failedTopics.length > 0 ? failedTopics.join(', ') : 'Not specified'}
Top performed topics: ${passedTopics.length > 0 ? passedTopics.join(', ') : 'Not specified'}
Students below 50%: ${atRiskCount}
Students above 75%: ${excellingCount}
Term: ${term}

Student tiers:
- Below 40% (critical intervention): ${below40.length > 0 ? below40.join('; ') : 'None'}
- 40-50% (small group sessions): ${s40to50.length > 0 ? s40to50.join('; ') : 'None'}
- Above 80% (enrichment): ${above80.length > 0 ? above80.join('; ') : 'None'}

Generate a practical AI Teaching Guide. Return ONLY valid JSON (no markdown):
{
  "situation_summary": "2 sentences describing what the results tell you",
  "bridge_learning_plan": [
    {
      "topic": "topic name",
      "root_cause": "why students likely failed",
      "strategies": ["strategy 1", "strategy 2", "strategy 3"],
      "creative_activity": "one memorable activity",
      "lessons_needed": 2
    }
  ],
  "aptitude_appreciation": {
    "what_worked": "what went well",
    "extend_high_performers": "enrichment activities",
    "peer_tutoring": "how to use top students"
  },
  "individual_attention": {
    "critical_below_40": ["student and suggestion"],
    "small_group_40_50": ["student and suggestion"],
    "enrichment_above_80": ["student and task"]
  },
  "next_exam_prediction": {
    "predicted_average": 65,
    "confidence": "Medium",
    "rationale": "reason for prediction"
  }
}`

  let guide: Record<string, unknown>
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      console.error('[exam/ai-guide] Claude error:', aiRes.status)
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
    }

    const aiData = await aiRes.json() as { content: { text: string }[] }
    const raw = aiData.content?.[0]?.text ?? '{}'
    const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    guide = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'Failed to generate guide' }, { status: 502 })
  }

  // Save guide to subject_performance (update most recent matching rows)
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date().toISOString()

  await sb
    .from('subject_performance')
    .update({
      ai_teaching_guide:    guide,
      guide_generated_at:   now,
      guide_shared_with_hod: shareWithHod ?? false,
    })
    .eq('school_id', info.schoolId)
    .eq('teacher_id', info.teacherId)
    .eq('class_name', className)
    .eq('subject_name', subjectName)
    .eq('exam_type', examType)
    .eq('term', term)

  // HOD notification if sharing
  if (shareWithHod) {
    await sb.from('hod_notifications').insert({
      school_id:    info.schoolId,
      from_user_id: info.teacherId,
      to_role:      'hod',
      type:         'teaching_guide',
      title:        `AI Teaching Guide — ${subjectName} ${className}`,
      body:         `${info.teacherName} shared a teaching guide after ${examType}. Class avg: ${avg}%.`,
      payload:      { guide, className, subjectName, examType, term, avg },
    })
  }

  return NextResponse.json({ success: true, guide })
}

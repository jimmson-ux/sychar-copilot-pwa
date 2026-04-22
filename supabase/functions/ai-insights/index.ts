import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

const ALLOWED_INSIGHT_TYPES = [
  'class_performance', 'student_at_risk', 'syllabus_velocity',
  'discipline_pattern', 'compliance_summary', 'fee_collection_trend',
  'gender_analysis', 'kcse_prediction', 'invigilation_suggest',
]

serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const auth = await verifyRequest(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const { context, insightType } = await req.json()

    if (!ALLOWED_INSIGHT_TYPES.includes(insightType)) {
      return new Response(JSON.stringify({ error: 'Invalid insight type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured')

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: `You are an educational data analyst for Nkoroi Mixed Day Senior Secondary School, a Kenyan secondary school. Provide concise, actionable insights for school administrators. Use Kenyan education context (8-4-4 and CBC curricula, KCSE grading). Keep responses under 200 words. Be direct and specific.`,
        messages: [{ role: 'user', content: context }],
      }),
    })

    if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`)
    const claudeData = await claudeRes.json()
    const insight    = claudeData.content?.[0]?.text || ''

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('ai_insights').insert([{
      school_id:    auth.schoolId,
      generated_by: auth.userId,
      insight_type: insightType,
      content:      insight,
      created_at:   new Date().toISOString(),
    }])

    return new Response(JSON.stringify({ success: true, insight }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (error) {
    console.error('[ai-insights]', error)
    return new Response(JSON.stringify({ error: 'AI processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})

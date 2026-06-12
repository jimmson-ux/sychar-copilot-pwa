import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

const ALLOWED_INSIGHT_TYPES = [
  'class_performance', 'student_at_risk', 'syllabus_velocity',
  'discipline_pattern', 'compliance_summary', 'fee_collection_trend',
  'gender_analysis', 'kcse_prediction', 'invigilation_suggest',
  'school_snapshot', 'morning_brief',
]

const SYSTEM_PROMPT = `You are an educational data analyst for a Kenyan secondary school.
Provide concise, actionable insights for school administrators.
Use Kenyan education context (KCSE grading, CBC/8-4-4, TSC standards).
Be direct and specific. Avoid generic advice.`

function buildPrompt(insightType: string, context: string): string {
  switch (insightType) {
    case 'class_performance':
      return `Analyse this class's academic performance for a Kenyan secondary school principal.
Identify: subjects where the class is struggling, individual at-risk students (below 40%),
comparison to last term, teacher effectiveness signals.
Max 120 words. Be specific with names and scores.

Data:
${context}`

    case 'student_at_risk':
      return `This student may need academic intervention. Analyse their performance trend.
Identify: which subjects are declining and by how much, likely causes (attendance? conduct?),
recommended actions for the class teacher and HOD.
Max 100 words. Be direct and actionable.

Data:
${context}`

    case 'compliance_summary':
      return `Summarise teacher document compliance for the principal of a Kenyan secondary school.
Which teachers are non-compliant, what documents are missing (schemes, lesson plans, records),
urgency level, and which ones to call in first.
Recommend 3 specific actions the principal should take this week.
Max 120 words.

Data:
${context}`

    case 'discipline_pattern':
      return `Analyse this student's discipline pattern for the dean of students.
Identify: escalation trend (is it getting worse?), likely triggers (time of day, subject, day of week),
type of misconduct, recommended intervention strategy.
Max 100 words. Suggest whether a G&C referral is warranted.

Data:
${context}`

    case 'school_snapshot':
      return `Generate a God's Eye principal summary for a Kenyan secondary school.
Sections: Academics (class averages, at-risk count), Staff (compliance, attendance, duty),
Finance (fee collection rate, outstanding), Discipline (active cases, trend),
Health (clinic visits, patterns), Urgent Actions (top 3 things needing immediate attention).
Max 200 words. Lead with the most critical issues.

Data:
${context}`

    case 'kcse_prediction':
      return `Based on this student's marks and syllabus coverage, predict their likely KCSE grade.
Identify: their 3 strongest subjects, 3 weakest subjects with improvement needed,
probability of meeting university entry requirements (C+ minimum),
specific study focus areas for the next term.
Max 150 words. Be realistic, not falsely encouraging.

Data:
${context}`

    case 'invigilation_suggest':
      return `Rank these teachers for exam invigilation duty assignment.
Consider: current workload (periods per week), subject relevance to exam being invigilated,
recent duty history (fairness — no one should be overloaded), availability.
Return ONLY valid JSON array: [{"teacher_id":"...","rank":1,"suitability_score":85,"reason":"..."}]
Order by rank ascending (1 = most suitable).

Data:
${context}`

    case 'fee_collection_trend':
      return `Analyse this school's fee collection trend for the bursar and principal.
Identify: collection rate vs target, which classes/streams have the most defaulters,
month-over-month trend, risk of end-of-term shortfall.
Recommend 2 specific actions to improve collection.
Max 120 words.

Data:
${context}`

    case 'gender_analysis':
      return `Analyse gender performance patterns in this school for the principal.
Identify: subjects where one gender significantly underperforms, attendance disparities,
discipline and G&C referral patterns by gender.
Recommend targeted interventions.
Max 120 words. Use Kenyan secondary school context.

Data:
${context}`

    case 'syllabus_velocity':
      return `Analyse syllabus coverage progress for the HOD.
Identify: which teachers are behind schedule (less than 60% coverage at this point of term),
subjects at risk of not completing before exams, teachers who are ahead.
Recommend urgent actions.
Max 100 words.

Data:
${context}`

    default:
      return `Analyse this school data and provide actionable insights.
Max 150 words. Be specific and direct.

Data:
${context}`
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    // Cron path: pg_cron sends x-cron-secret instead of a user JWT
    const cronSecret = req.headers.get('x-cron-secret')
    const isCron = !!cronSecret && cronSecret === Deno.env.get('CRON_SECRET')

    let auth: { userId: string; schoolId: string; role: string } | null = null
    if (!isCron) {
      auth = await verifyRequest(req)
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        })
      }
    }

    const { context, insightType } = await req.json()

    if (!ALLOWED_INSIGHT_TYPES.includes(insightType)) {
      return new Response(JSON.stringify({ error: `Invalid insight type. Allowed: ${ALLOWED_INSIGHT_TYPES.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const GROQ_API_KEY   = Deno.env.get('GROQ_API_KEY') ?? ''
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
    const AI_KEY   = GROQ_API_KEY || OPENAI_API_KEY
    const AI_URL   = GROQ_API_KEY ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
    const AI_MODEL = GROQ_API_KEY ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'
    if (!AI_KEY) throw new Error('No AI API key configured (set GROQ_API_KEY or OPENAI_API_KEY)')

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // School-aware framing (boys-only / boarding) for the tenant.
    let systemPrompt = SYSTEM_PROMPT
    if (auth?.schoolId) {
      const { data: sm } = await supabase
        .from('school_metadata')
        .select('gender_profile, school_type')
        .eq('school_id', auth.schoolId)
        .maybeSingle()
      if (sm) {
        const extras: string[] = []
        if (sm.gender_profile === 'boys') extras.push('This is a BOYS-ONLY school — frame discipline, performance and mental-health analysis around boy-child behaviour and tendencies; never reference female students.')
        else if (sm.gender_profile === 'girls') extras.push('This is a GIRLS-ONLY school — frame analysis around girl-child behaviour; never reference male students.')
        if (sm.school_type === 'boarding' || sm.school_type === 'both') extras.push('It is a boarding school — consider boarding welfare (homesickness, dormitory dynamics, prep routines, sick-bay patterns, night safety).')
        if (extras.length) systemPrompt = `${SYSTEM_PROMPT}\n${extras.join(' ')}`
      }
    }

    const prompt = buildPrompt(insightType, typeof context === 'string' ? context : JSON.stringify(context))

    const claudeRes = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_KEY}`,
        'content-type':  'application/json',
      },
      body: JSON.stringify({
        model:      AI_MODEL,
        max_tokens: insightType === 'invigilation_suggest' ? 600 : 400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: prompt },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      throw new Error(`Groq API error ${claudeRes.status}: ${errText}`)
    }

    const claudeData = await claudeRes.json() as { choices?: { message: { content: string } }[] }
    const insight    = claudeData.choices?.[0]?.message?.content ?? ''

    await supabase.from('ai_insights').insert([{
      school_id:    auth?.schoolId ?? null,
      generated_by: auth?.userId ?? null,
      insight_type: insightType,
      content:      insight,
      created_at:   new Date().toISOString(),
    }])

    // For invigilation_suggest: parse and return structured JSON
    if (insightType === 'invigilation_suggest') {
      try {
        const jsonMatch = insight.match(/\[[\s\S]*\]/)
        const ranked    = jsonMatch ? JSON.parse(jsonMatch[0]) : []
        return new Response(JSON.stringify({ success: true, insight, ranked }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        })
      } catch {
        // Fall through to plain response
      }
    }

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

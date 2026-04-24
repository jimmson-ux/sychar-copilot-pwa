// POST /api/ai/principal-summary
// Generates an AI school summary for the principal, stored in ai_insights.
// Principal only. Rate-limited to prevent excessive Claude calls.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`principal-ai:${ip}`, LIMITS.AI_CHAT.max, LIMITS.AI_CHAT.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Principal only' }, { status: 403 })
  }

  const db    = svc()
  const today = new Date().toISOString().split('T')[0]
  const todayStart = today + 'T00:00:00Z'

  const month = new Date().getMonth() + 1
  const term  = String(month <= 4 ? 1 : month <= 8 ? 2 : 3)
  const year  = String(new Date().getFullYear())

  // Fetch all context in parallel
  const [
    attendanceRes,
    staffAbsentRes,
    clinicRes,
    disciplineRes,
    feesRes,
    complianceRes,
    pendingReqsRes,
    dutyRes,
  ] = await Promise.all([
    db.from('attendance_records')
      .select('status', { count: 'exact' })
      .eq('school_id', auth.schoolId!)
      .eq('date', today),
    db.from('staff_records')
      .select('full_name, subject_specialization')
      .eq('school_id', auth.schoolId!)
      .eq('is_active', true)
      .eq('is_present_today', false)
      .limit(10),
    db.from('sick_bay_visits')
      .select('id, complaint', { count: 'exact' })
      .eq('school_id', auth.schoolId!)
      .gte('admitted_at', todayStart),
    db.from('discipline_records')
      .select('id, severity', { count: 'exact' })
      .eq('school_id', auth.schoolId!)
      .eq('resolved', false)
      .eq('severity', 'critical'),
    db.from('vote_heads')
      .select('name, allocated_amount, spent_amount')
      .eq('school_id', auth.schoolId!)
      .eq('academic_year', year)
      .eq('term', Number(term)),
    db.from('document_compliance')
      .select('compliance_score')
      .eq('school_id', auth.schoolId!)
      .eq('term', Number(term))
      .eq('academic_year', year),
    db.from('aie_forms')
      .select('id', { count: 'exact' })
      .eq('school_id', auth.schoolId!)
      .eq('status', 'pending'),
    db.from('duty_assignments')
      .select('id', { count: 'exact' })
      .eq('school_id', auth.schoolId!)
      .gte('duty_date', today)
      .lte('duty_date', today),
  ])

  // Attendance stats
  const attRecords = attendanceRes.data ?? []
  const presentCount  = attRecords.filter(r => r.status === 'present').length
  const absentCount   = attRecords.filter(r => r.status === 'absent').length
  const attendanceRate = attRecords.length > 0
    ? Math.round((presentCount / attRecords.length) * 100)
    : null

  // Compliance summary
  const scores = (complianceRes.data ?? []).map(c => c.compliance_score ?? 0)
  const compGreen = scores.filter(s => s >= 80).length
  const compRed   = scores.filter(s => s < 50).length

  // Fee collection
  const feeTotal     = (feesRes.data ?? []).reduce((s, v) => s + (v.spent_amount ?? 0), 0)
  const feeAllocated = (feesRes.data ?? []).reduce((s, v) => s + (v.allocated_amount ?? 0), 0)
  const feeCollRate  = feeAllocated > 0 ? Math.round((feeTotal / feeAllocated) * 100) : 0

  const context = `
School Context — ${today}:
- Attendance today: ${presentCount} present, ${absentCount} absent${attendanceRate !== null ? `, ${attendanceRate}% rate` : ' (no records yet)'}
- Staff absent today: ${staffAbsentRes.data?.length ?? 0}${staffAbsentRes.data?.length ? ': ' + staffAbsentRes.data.map(s => s.full_name).join(', ') : ''}
- Clinic visits today: ${clinicRes.count ?? 0}
- Critical unresolved discipline cases: ${disciplineRes.count ?? 0}
- Term ${term} FDSE: ${feeCollRate}% utilised (KES ${feeTotal.toLocaleString()} of KES ${feeAllocated.toLocaleString()} allocated)
- Document compliance: ${compGreen}/${scores.length} teachers green, ${compRed} at risk (<50%)
- Pending requisitions awaiting approval: ${pendingReqsRes.count ?? 0}
- Staff on duty today: ${dutyRes.count ?? 0}
`.trim()

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are the AI command center for a Kenyan secondary school principal. Based on the following school data, provide a concise daily briefing in exactly this format:

1. Start with a one-sentence overall status (traffic light: 🟢 All systems normal / 🟡 Attention needed / 🔴 Urgent action required)
2. List the top 3 items needing principal attention right now (be specific and actionable)
3. One positive highlight from today's data

Keep the entire response under 200 words. Use plain text, no markdown headers.

School data:
${context}`,
    }],
  })

  const summary = msg.content[0].type === 'text' ? msg.content[0].text : ''

  // Store in ai_insights
  await db.from('ai_insights').insert({
    school_id:       auth.schoolId,
    insight_type:    'school_summary',
    severity:        'info',
    summary,
    recommendation:  'Reviewed by principal AI command center',
    generated_at:    new Date().toISOString(),
    is_actioned:     false,
  })

  return NextResponse.json({ ok: true, summary })
}

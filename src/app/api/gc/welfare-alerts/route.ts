// POST /api/gc/welfare-alerts
// Student welfare anomaly detection: cross-references attendance, exam velocity,
// and discipline trends → AI risk score → inserts to welfare_alerts table.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'
import { askAIProvider } from '@/lib/aiProvider'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set([
  'guidance_counselling', 'counselor', 'dean_of_students',
  'principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_academics',
])

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`welfare:${ip}`, LIMITS.AI_CHAT.max, LIMITS.AI_CHAT.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Counselor or dean access required' }, { status: 403 })
  }

  let body: { studentId?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 })
  }

  const db = svc()
  const studentId = body.studentId
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [attendanceRes, examRes, disciplineRes, studentRes] = await Promise.all([
    db.from('attendance_records')
      .select('status, date')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', studentId)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: false }),
    db.from('marks')
      .select('percentage, created_at, subject_id')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('discipline_records')
      .select('severity, created_at')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', studentId)
      .gte('created_at', thirtyDaysAgo),
    db.from('students')
      .select('full_name, class_name, admission_no')
      .eq('id', studentId)
      .eq('school_id', auth.schoolId!)
      .single(),
  ])

  const attendance = attendanceRes.data ?? []
  const exams = examRes.data ?? []
  const discipline = disciplineRes.data ?? []
  const student = studentRes.data

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Compute metrics
  const totalDays = attendance.length
  const absentDays = attendance.filter(r => r.status === 'absent').length
  const absenceRate = totalDays > 0 ? Math.round((absentDays / totalDays) * 100) : 0

  const examAvg = exams.length > 0
    ? Math.round(exams.reduce((s, e) => s + Number(e.percentage ?? 0), 0) / exams.length)
    : null

  // Score trend: compare recent half vs older half
  let scoreTrend = 'insufficient data'
  if (exams.length >= 4) {
    const recent = exams.slice(0, Math.ceil(exams.length / 2))
    const older  = exams.slice(Math.ceil(exams.length / 2))
    const recentAvg = recent.reduce((s, e) => s + Number(e.percentage ?? 0), 0) / recent.length
    const olderAvg  = older.reduce((s, e) => s + Number(e.percentage ?? 0), 0) / older.length
    const delta = Math.round(recentAvg - olderAvg)
    scoreTrend = delta >= 5 ? `improving (+${delta}%)` : delta <= -5 ? `declining (${delta}%)` : 'stable'
  }

  const severeDiscipline = discipline.filter(d => d.severity === 'critical' || d.severity === 'major').length

  const context = `
Student: ${student.full_name}, Class: ${student.class_name ?? 'unknown'}, Adm: ${student.admission_no}
Last 30 days:
- Attendance: ${absentDays}/${totalDays} days absent (${absenceRate}% absence rate)
- Exam performance: ${examAvg !== null ? examAvg + '% average' : 'no recent exams'}
- Score trend: ${scoreTrend}
- Discipline incidents: ${discipline.length} total, ${severeDiscipline} severe (critical/major)
`.trim()

  let rawText = '{}'
  try {
    // OpenAI (ChatGPT) → Anthropic (Claude) → Groq.
    const ai = await askAIProvider(
      'You are a student welfare AI for a Kenyan secondary school.',
      [{ role: 'user', content: `Assess this student's welfare risk.

${context}

Return ONLY valid JSON:
{
  "risk_score": 0,
  "risk_factors": ["specific factor observed"],
  "recommendation": "1-2 sentence actionable counselor recommendation"
}

risk_score: 0-100 (0=no concern, 40=monitor, 70=refer, 90=urgent)` }],
      400,
    )
    rawText = ai.content || '{}'
  } catch {
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }
  let aiResult: { risk_score?: number; risk_factors?: string[]; recommendation?: string }
  try {
    aiResult = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch {
    aiResult = { risk_score: 50, risk_factors: ['Assessment error'], recommendation: rawText.slice(0, 200) }
  }

  const riskScore    = Math.max(0, Math.min(100, Number(aiResult.risk_score ?? 50)))
  const riskFactors  = aiResult.risk_factors ?? []
  const recommendation = aiResult.recommendation ?? ''

  const { data: alertRow, error: alertErr } = await db
    .from('welfare_alerts')
    .insert({
      school_id:     auth.schoolId,
      student_id:    studentId,
      risk_score:    riskScore,
      risk_factors:  riskFactors,
      recommendation,
      status:        'open',
    })
    .select('id')
    .single()

  if (alertErr) {
    console.error('[welfare-alerts] insert error:', alertErr.message)
  }

  return NextResponse.json({
    riskScore, riskFactors, recommendation,
    alertId: alertRow?.id ?? null,
    studentName: student.full_name,
  })
}

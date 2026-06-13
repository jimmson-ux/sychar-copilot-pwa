import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { askAIProvider } from '@/lib/aiProvider'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gc/student-360?studentId=… — the counsellor's Student Welfare 360°.
 * Aggregates ACADEMIC (marks) + DISCIPLINE + ATTENDANCE + CLINIC + welfare cases into
 * a risk score, with an AI welfare summary (ChatGPT/Claude). Counsellor + leadership only.
 * School-scoped (service-role reads gated by the caller's school_id).
 */
const ALLOWED = new Set(['guidance_counselling', 'principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'dean_of_students', 'dean_of_studies'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Counsellor or leadership only' }, { status: 403 })
  const studentId = new URL(req.url).searchParams.get('studentId')
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

  const svc = createAdminSupabaseClient()
  const sid = auth.schoolId

  const { data: student } = await svc.from('students')
    .select('id, full_name, class_name, admission_no, gender').eq('id', studentId).eq('school_id', sid).maybeSingle()
  if (!student) return NextResponse.json({ error: 'Student not found in your school' }, { status: 404 })

  const [att, disc, clinic, marks, cases] = await Promise.all([
    svc.from('attendance_records').select('status', { count: 'exact' }).eq('school_id', sid).eq('student_id', studentId).limit(1000),
    svc.from('discipline_records').select('category, severity, incident_date', { count: 'exact' }).eq('school_id', sid).eq('student_id', studentId).order('incident_date', { ascending: false }).limit(20),
    svc.from('sick_bay_visits').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('student_id', studentId),
    svc.from('marks').select('percentage, subject_id, exam_type, term').eq('student_id', studentId).order('recorded_at', { ascending: false }).limit(60),
    svc.from('safeguard_cases').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('student_id', studentId).neq('status', 'resolved'),
  ])

  const attRows = (att.data as { status: string }[] ?? [])
  const presentN = attRows.filter((r) => /present/i.test(r.status ?? '')).length
  const attendancePct = attRows.length ? Math.round((presentN / attRows.length) * 100) : null
  const disciplineCount = disc.count ?? 0
  const clinicVisits = clinic.count ?? 0
  const openCases = cases.count ?? 0
  const markRows = (marks.data as { percentage: number | null }[] ?? []).filter((m) => m.percentage != null)
  const academicMean = markRows.length ? Math.round(markRows.reduce((s, m) => s + Number(m.percentage), 0) / markRows.length) : null

  // Composite risk score (0–100; higher = more concern).
  let risk = 0
  if (attendancePct != null && attendancePct < 80) risk += Math.min(30, (80 - attendancePct))
  risk += Math.min(30, disciplineCount * 8)
  if (clinicVisits >= 5) risk += Math.min(20, (clinicVisits - 4) * 4)
  if (academicMean != null && academicMean < 45) risk += Math.min(20, (45 - academicMean))
  risk = Math.min(100, Math.round(risk))
  const riskLevel = risk >= 70 ? 'High' : risk >= 40 ? 'Moderate' : 'Low'

  const summary360 = {
    student: { id: student.id, full_name: student.full_name, class_name: student.class_name, admission_no: student.admission_no },
    attendance_pct: attendancePct, discipline_count: disciplineCount, clinic_visits: clinicVisits,
    academic_mean: academicMean, open_welfare_cases: openCases, risk_score: risk, risk_level: riskLevel,
    recent_discipline: (disc.data as { category: string; severity: string; incident_date: string }[] ?? []).slice(0, 5),
  }

  // AI welfare summary (counsellor-facing; ChatGPT → Claude → Groq).
  let aiSummary = ''
  try {
    const { content } = await askAIProvider(
      'You are a school guidance & counselling assistant for a Kenyan secondary school. Be supportive, practical and non-judgemental. Suggest concrete next steps the counsellor can take.',
      [{ role: 'user', content: `Summarise this student's welfare and recommend interventions (max 120 words).\n${JSON.stringify(summary360)}` }],
      400,
    )
    aiSummary = content
  } catch { aiSummary = '' }

  return NextResponse.json({ ...summary360, ai_summary: aiSummary })
}

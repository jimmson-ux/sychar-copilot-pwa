// POST /api/bom-report/generate — principal only; full-term Board of Management report

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Principal only' }, { status: 403 })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({})) as {
    term?: number
    academicYear?: string
    format?: 'json' | 'pdf'
  }

  const term         = body.term ?? currentTerm()
  const academicYear = body.academicYear ?? new Date().getFullYear().toString()
  const format       = body.format ?? 'json'

  const db  = svc()
  const sid = auth.schoolId!

  // Date range for the term
  const { termStart, termEnd } = termDateRange(term, parseInt(academicYear))

  // Fetch all module data in parallel
  const [
    schoolRes,
    attendanceRes,
    staffCountRes,
    complianceRes,
    feesRes,
    disciplineRes,
    clinicRes,
    requisitionsRes,
    appraisalsRes,
    talentRes,
    kcseRes,
  ] = await Promise.all([
    db.from('schools').select('name, school_code, category').eq('id', sid).single(),

    // Student attendance this term
    db.from('student_attendance')
      .select('status')
      .eq('school_id', sid)
      .gte('date', termStart)
      .lte('date', termEnd),

    // Active staff
    db.from('staff_records')
      .select('id, sub_role')
      .eq('school_id', sid)
      .eq('is_active', true),

    // Compliance: red zone (< 50)
    db.from('compliance_tracking')
      .select('staff_id, score')
      .eq('school_id', sid),

    // Fee collection this term
    db.from('fee_records')
      .select('amount, fee_type')
      .eq('school_id', sid)
      .gte('created_at', termStart + 'T00:00:00')
      .lte('created_at', termEnd + 'T23:59:59'),

    // Discipline this term
    db.from('discipline_records')
      .select('severity, status')
      .eq('school_id', sid)
      .gte('created_at', termStart + 'T00:00:00')
      .lte('created_at', termEnd + 'T23:59:59'),

    // Clinic visits this term
    db.from('clinic_visits')
      .select('id, complaint')
      .eq('school_id', sid)
      .gte('visited_at', termStart + 'T00:00:00')
      .lte('visited_at', termEnd + 'T23:59:59'),

    // Pending + resolved requisitions
    db.from('requisitions')
      .select('id, status, total_amount')
      .eq('school_id', sid)
      .gte('created_at', termStart + 'T00:00:00'),

    // Duty appraisals this term
    db.from('appraisals')
      .select('overall_rating, punctuality, incident_handling, report_quality, student_welfare')
      .eq('school_id', sid)
      .gte('duty_date', termStart)
      .lte('duty_date', termEnd),

    // Talent points this term
    db.from('talent_points')
      .select('student_id, category, points')
      .eq('school_id', sid)
      .eq('status', 'approved'),

    // KCSE predictions (Form 4)
    db.from('kcse_predictions')
      .select('predicted_grade, university_eligible')
      .eq('school_id', sid)
      .eq('academic_year', academicYear),
  ])

  const school = (schoolRes.data as { name: string; school_code: string; category: string } | null)

  // ── Academic ──────────────────────────────────────────────────────────────
  const attendance = attendanceRes.data ?? []
  const totalAtt   = attendance.length
  const presentAtt = attendance.filter((a: { status: string }) => a.status === 'present').length
  const attendanceRate = totalAtt > 0 ? Math.round(presentAtt / totalAtt * 100) : null

  // ── Staffing ──────────────────────────────────────────────────────────────
  const staff         = (staffCountRes.data ?? []) as { id: string; sub_role: string }[]
  const totalStaff    = staff.length
  const teachingStaff = staff.filter(s => !['principal','deputy_principal_academics','deputy_principal_academic','deputy_principal_admin','deputy_principal_discipline','bursar','accountant','storekeeper'].includes(s.sub_role ?? '')).length

  const compliance   = (complianceRes.data ?? []) as { staff_id: string; score: number }[]
  const redZone      = compliance.filter(c => c.score < 50).length
  const avgCompliance = compliance.length > 0
    ? Math.round(compliance.reduce((s, c) => s + c.score, 0) / compliance.length)
    : 0

  type AppraisalRow = { overall_rating: string; punctuality: number; incident_handling: number; report_quality: number; student_welfare: number }
  const appraisals = (appraisalsRes.data ?? []) as AppraisalRow[]
  const avgAppraisal = appraisals.length > 0
    ? Math.round(appraisals.reduce((s, a) => s + ((a.punctuality + a.incident_handling + a.report_quality + a.student_welfare) / 4), 0) / appraisals.length * 10) / 10
    : null

  // ── Financial ─────────────────────────────────────────────────────────────
  const fees      = (feesRes.data ?? []) as { amount: number; fee_type: string }[]
  const feeTotal  = fees.reduce((s, f) => s + (f.amount ?? 0), 0)
  const reqs      = (requisitionsRes.data ?? []) as { id: string; status: string; total_amount: number }[]
  const reqTotal  = reqs.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const pendingReqs = reqs.filter(r => r.status === 'pending').length

  // ── Discipline ────────────────────────────────────────────────────────────
  const discipline = (disciplineRes.data ?? []) as { severity: string; status: string }[]
  const criticalCases  = discipline.filter(d => d.severity === 'critical').length
  const majorCases     = discipline.filter(d => d.severity === 'major').length
  const resolvedCases  = discipline.filter(d => d.status === 'resolved').length
  const resolutionRate = discipline.length > 0 ? Math.round(resolvedCases / discipline.length * 100) : 100

  // ── Health ────────────────────────────────────────────────────────────────
  const clinicVisits = clinicRes.data?.length ?? 0

  // ── Talent ────────────────────────────────────────────────────────────────
  const talentRows  = (talentRes.data ?? []) as { student_id: string; category: string; points: number }[]
  const uniqueRecognised = new Set(talentRows.map(t => t.student_id)).size

  // ── KCSE Predictions ──────────────────────────────────────────────────────
  const kcseRows       = (kcseRes.data ?? []) as { predicted_grade: string; university_eligible: boolean }[]
  const uniEligible    = kcseRows.filter(k => k.university_eligible).length
  const kcseEligRate   = kcseRows.length > 0 ? Math.round(uniEligible / kcseRows.length * 100) : null

  // ── Build Claude prompt ───────────────────────────────────────────────────
  const termLabel  = `Term ${term} ${academicYear}`
  const schoolName = school?.name ?? 'School'

  const dataContext = {
    school: schoolName,
    term: termLabel,
    attendance: attendanceRate !== null ? `${attendanceRate}%` : 'No data',
    totalStaff,
    teachingStaff,
    complianceAvg: `${avgCompliance}%`,
    redZoneTeachers: redZone,
    avgAppraisalScore: avgAppraisal ?? 'No data',
    feesCollected: `KES ${feeTotal.toLocaleString()}`,
    totalRequisitions: reqs.length,
    pendingRequisitions: pendingReqs,
    disciplineTotal: discipline.length,
    criticalCases,
    majorCases,
    resolutionRate: `${resolutionRate}%`,
    clinicVisits,
    studentsRecognised: uniqueRecognised,
    kcseEligibilityRate: kcseEligRate !== null ? `${kcseEligRate}%` : 'Not computed',
  }

  const prompt = `Write a 500-word Board of Management report for ${schoolName} for ${termLabel}.
School data: ${JSON.stringify(dataContext)}

Format the report in professional Kenyan school English with these sections:
1. EXECUTIVE SUMMARY (80 words)
2. ACADEMIC PERFORMANCE (80 words) — attendance, KCSE eligibility forecast
3. FINANCIAL STATUS (80 words) — fees, requisitions, financial discipline
4. STAFFING REPORT (80 words) — staff count, compliance, appraisals
5. STUDENT WELFARE & DISCIPLINE (80 words) — clinic, discipline stats, resolutions
6. RECOMMENDATIONS (80 words) — 3 specific, actionable recommendations for the board

Use formal tone appropriate for a Board of Management presentation. No markdown, plain paragraphs under each heading.`

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system:     'You are an expert Kenyan school management consultant writing formal Board of Management reports.',
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  const claudeData = claudeRes.ok
    ? await claudeRes.json() as { content?: Array<{ text: string }> }
    : { content: [] }
  const narrative = claudeData.content?.[0]?.text ?? 'Report generation failed.'

  const reportPayload = {
    school_id:    sid,
    school_name:  schoolName,
    term,
    academic_year: academicYear,
    generated_at: new Date().toISOString(),
    narrative,
    metrics: dataContext,
  }

  // Store in ai_insights for audit
  await db.from('ai_insights').insert({
    school_id:    sid,
    insight_type: 'bom_report',
    target_type:  'bom_report',
    content:      narrative,
    severity:     'info',
    metadata:     { term, academicYear },
    created_at:   new Date().toISOString(),
  }).then(() => {}, () => {})

  if (format === 'pdf') {
    const pdfRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        docType:  'bom_report',
        data:     reportPayload,
        schoolId: sid,
        filename: `BOM-Report-${termLabel.replace(/\s/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
      }),
    })

    if (pdfRes.ok) {
      const pdfData = await pdfRes.json() as { url?: string }
      return NextResponse.json({ ...reportPayload, pdfUrl: pdfData.url ?? null })
    }
  }

  return NextResponse.json(reportPayload)
}

function currentTerm(): number {
  const m = new Date().getMonth() + 1
  return m <= 4 ? 1 : m <= 8 ? 2 : 3
}

function termDateRange(term: number, year: number): { termStart: string; termEnd: string } {
  // Approximate Kenya school term dates
  const ranges: Record<number, [string, string]> = {
    1: [`${year}-01-07`, `${year}-04-18`],
    2: [`${year}-05-05`, `${year}-08-01`],
    3: [`${year}-09-01`, `${year}-11-14`],
  }
  const [s, e] = ranges[term] ?? [`${year}-01-01`, `${year}-12-31`]
  return { termStart: s, termEnd: e }
}

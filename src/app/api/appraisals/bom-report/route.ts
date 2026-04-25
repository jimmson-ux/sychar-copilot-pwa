// GET /api/appraisals/bom-report — principal only; BOM-ready appraisal summary PDF

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function currentTermId() {
  const now = new Date()
  const m   = now.getMonth() + 1
  const t   = m <= 4 ? 1 : m <= 8 ? 2 : 3
  return `${now.getFullYear()}-T${t}`
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Principal only' }, { status: 403 })
  }

  const termId = req.nextUrl.searchParams.get('term_id') ?? currentTermId()
  const format = req.nextUrl.searchParams.get('format') ?? 'json'
  const db     = svc()

  // Fetch all duty appraisals for the term
  const { data: appraisals, error } = await db
    .from('appraisals')
    .select(`
      id, duty_date, punctuality, incident_handling, report_quality,
      student_welfare, overall_rating, duty_notes, appraisee_id,
      staff_records!appraisee_id(full_name, sub_role, department, subject_specialization, employment_type)
    `)
    .eq('school_id', auth.schoolId!)
    .eq('appraisal_type', 'duty')
    .order('duty_date', { ascending: true })

  if (error) {
    console.error('[appraisals/bom-report] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type StaffInfo = {
    full_name: string; sub_role: string; department: string | null
    subject_specialization: string | null; employment_type: string | null
  }
  type AppraisalRow = {
    id: string; duty_date: string; punctuality: number; incident_handling: number
    report_quality: number; student_welfare: number; overall_rating: string
    duty_notes: string | null; appraisee_id: string
    staff_records: StaffInfo | null
  }

  const rows = (appraisals ?? []) as unknown as AppraisalRow[]

  // Aggregate per teacher
  const teacherMap = new Map<string, { info: StaffInfo; duties: AppraisalRow[] }>()
  for (const row of rows) {
    if (!teacherMap.has(row.appraisee_id)) {
      teacherMap.set(row.appraisee_id, {
        info:   row.staff_records ?? { full_name: 'Unknown', sub_role: '', department: null, subject_specialization: null, employment_type: null },
        duties: [],
      })
    }
    teacherMap.get(row.appraisee_id)!.duties.push(row)
  }

  // Build BOM summary
  const bomData = Array.from(teacherMap.entries()).map(([staffId, { info, duties }]) => {
    const n      = duties.length
    const avg    = (f: keyof AppraisalRow) =>
      n > 0 ? Math.round(duties.reduce((s, r) => s + ((r[f] as number) ?? 0), 0) / n * 10) / 10 : 0

    const avgPunctuality       = avg('punctuality')
    const avgIncidentHandling  = avg('incident_handling')
    const avgReportQuality     = avg('report_quality')
    const avgStudentWelfare    = avg('student_welfare')
    const overallScore         = Math.round(
      (avgPunctuality * 0.25 + avgIncidentHandling * 0.25 + avgReportQuality * 0.25 + avgStudentWelfare * 0.25) * 10
    ) / 10

    const bomRating = overallScore >= 9 ? 'Excellent'
      : overallScore >= 7 ? 'Good'
      : overallScore >= 5 ? 'Satisfactory'
      : 'Needs Improvement'

    return {
      staff_id:               staffId,
      staff_name:             info.full_name,
      department:             info.department ?? 'General',
      subject:                info.subject_specialization ?? '',
      employment_type:        info.employment_type ?? '',
      total_duties_graded:    n,
      avg_punctuality:        avgPunctuality,
      avg_incident_handling:  avgIncidentHandling,
      avg_report_quality:     avgReportQuality,
      avg_student_welfare:    avgStudentWelfare,
      overall_score:          overallScore,
      bom_rating:             bomRating,
    }
  })

  // Sort: by department then by overall score descending
  bomData.sort((a, b) => {
    if (a.department < b.department) return -1
    if (a.department > b.department) return 1
    return b.overall_score - a.overall_score
  })

  // School-level summary
  const graded     = bomData.filter(t => t.total_duties_graded > 0)
  const schoolAvg  = graded.length > 0
    ? Math.round(graded.reduce((s, t) => s + t.overall_score, 0) / graded.length * 10) / 10
    : 0

  const deptSummary = new Map<string, { count: number; total: number }>()
  for (const t of graded) {
    const d = deptSummary.get(t.department) ?? { count: 0, total: 0 }
    d.count++; d.total += t.overall_score
    deptSummary.set(t.department, d)
  }

  const departments = Array.from(deptSummary.entries()).map(([dept, { count, total }]) => ({
    department:   dept,
    teacher_count: count,
    avg_score:    Math.round(total / count * 10) / 10,
  })).sort((a, b) => b.avg_score - a.avg_score)

  const reportPayload = {
    term_id:        termId,
    generated_at:   new Date().toISOString(),
    school_average: schoolAvg,
    total_staff:    bomData.length,
    graded_count:   graded.length,
    departments,
    teachers:       bomData,
  }

  if (format === 'pdf') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const pdfRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        docType:   'bom_report',
        data:      reportPayload,
        schoolId:  auth.schoolId,
        filename:  `BOM-Appraisal-${termId}-${new Date().toISOString().split('T')[0]}.pdf`,
      }),
    })

    if (pdfRes.ok) {
      const pdfData = await pdfRes.json() as { url?: string }
      return NextResponse.json({ ...reportPayload, pdfUrl: pdfData.url ?? null })
    }
  }

  return NextResponse.json(reportPayload)
}

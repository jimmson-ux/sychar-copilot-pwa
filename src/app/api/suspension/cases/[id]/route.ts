// GET   /api/suspension/cases/[id] — case detail + auto-scraped evidence
// PATCH /api/suspension/cases/[id] — update case (student response, media, draft letter, submit)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['deputy', 'deputy_principal', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()

  const { data: c } = await db
    .from('suspension_cases')
    .select('*, students(full_name, class_name, admission_number, parent_phone, date_of_birth), staff_records!created_by(full_name)')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const caseData = c as {
    id: string; student_id: string; incident_date: string; allegations: string;
    status: string; student_response: string | null;
    tod_reports: unknown[]; teacher_flags: unknown[]; corrective_history: unknown[];
    media_attachments: unknown[]; draft_letter: string | null;
    students: { full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null } | null;
    staff_records: { full_name: string } | null;
  }

  // ── Auto-scrape evidence ──────────────────────────────────────────────────
  const incidentDate = caseData.incident_date
  const studentId    = caseData.student_id

  const [todRes, disciplineRes, attendanceRes] = await Promise.all([
    // TOD reports linked by date
    db.from('teacher_on_duty')
      .select('duty_date, report, staff_records(full_name)')
      .eq('school_id', auth.schoolId!)
      .gte('duty_date', new Date(new Date(incidentDate).getTime() - 7 * 86400000).toISOString().split('T')[0])
      .lte('duty_date', incidentDate)
      .order('duty_date', { ascending: false })
      .limit(5),

    // Corrective history for this student
    db.from('discipline_records')
      .select('date, incident_type, severity, action_taken, resolution_status')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .limit(20),

    // Attendance pattern (last 30 days)
    db.from('attendance_records')
      .select('date, status')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', studentId)
      .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
      .order('date', { ascending: false }),
  ])

  // Attendance summary
  const attRecords = (attendanceRes.data ?? []) as { status: string }[]
  const attTotal   = attRecords.length
  const attPresent = attRecords.filter(r => r.status === 'present').length
  const attRate    = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null

  const scrapedEvidence = {
    tod_reports:        todRes.data ?? [],
    corrective_history: disciplineRes.data ?? [],
    attendance_summary: {
      total_days:    attTotal,
      present_days:  attPresent,
      attendance_pct: attRate,
    },
  }

  // Auto-populate draft letter if not yet written
  let draftLetter = caseData.draft_letter
  if (!draftLetter && caseData.students) {
    const student = caseData.students
    const today   = new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
    draftLetter = `Date: ${today}\n\nDear Parent/Guardian of ${student.full_name},\n\nFurther to investigations carried out regarding the incident of ${new Date(incidentDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })}, we wish to inform you that ${student.full_name} has been found in violation of school rules as follows:\n\n${caseData.allegations}\n\nAs a consequence, the school has resolved to suspend ${student.full_name} from [START DATE] to [END DATE] inclusive.\n\nA mandatory readmission meeting is required before your child returns to school. Please contact the school to schedule this meeting.\n\nYours sincerely,\n\n[Principal's Signature]\nPrincipal`
  }

  return NextResponse.json({
    case:             { ...caseData, draft_letter: draftLetter },
    scraped_evidence: scrapedEvidence,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['deputy', 'deputy_principal', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id }  = await params
  const db      = svc()
  const body    = await req.json() as {
    student_informed_date?: string
    student_response?:      string
    media_attachments?:     unknown[]
    draft_letter?:          string
    submit?:                boolean   // deputy submits to principal
    declined_reason?:       string
  }

  // Fetch case to validate ownership + status
  const { data: existing } = await db
    .from('suspension_cases')
    .select('id, status, student_response, student_informed_date, school_id')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  const e = existing as { id: string; status: string; student_response: string | null; student_informed_date: string | null }

  if (e.status === 'approved') return NextResponse.json({ error: 'Case already approved — cannot edit' }, { status: 409 })

  const updates: Record<string, unknown> = {}

  if (body.student_informed_date !== undefined) updates.student_informed_date = body.student_informed_date
  if (body.student_response      !== undefined) {
    updates.student_response    = body.student_response
    updates.response_recorded_at = new Date().toISOString()
  }
  if (body.media_attachments     !== undefined) updates.media_attachments     = body.media_attachments
  if (body.draft_letter          !== undefined) updates.draft_letter          = body.draft_letter

  if (body.submit) {
    // Validate mandatory checklist before submit
    const informedDate = body.student_informed_date ?? e.student_informed_date
    const response     = body.student_response      ?? e.student_response
    if (!informedDate) return NextResponse.json({ error: 'Student informed date required before submission' }, { status: 400 })
    if (!response?.trim()) return NextResponse.json({ error: 'Student response required before submission' }, { status: 400 })

    updates.status       = 'submitted'
    updates.submitted_at = new Date().toISOString()

    // Alert principal — PRIORITY
    db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'suspension_submitted',
      severity:  'high',
      title:     `Suspension case submitted — requires your review`,
      detail:    { case_id: id },
    }).then(() => {}, () => {})
  }

  await db.from('suspension_cases').update(updates).eq('id', id)
  return NextResponse.json({ ok: true })
}

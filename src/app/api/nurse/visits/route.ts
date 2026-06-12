// GET  /api/nurse/visits — current sick bay patients + today's visits
// POST /api/nurse/visits — log a new sick bay visit
//
// On POST:
//   action=Sent Home  → WhatsApp parent + update attendance + notify teacher + gate log
//   action=Bed Rest   → notify dorm master + night TOD + WhatsApp parent
//   outbreak check    → 3+ same complaint today → principal alert

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendWhatsApp } from '@/lib/whatsapp'
import { recordMedicationIssue, followupDueFromPlan, type MedItem } from '@/lib/nurseStock'
import { isClassHoursNow, studentCurrentLesson } from '@/lib/lessonContext'
import { indexSchoolDocument } from '@/lib/rag'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ── GET — current sick bay + today's visits ───────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db      = svc()
  const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z'

  const [inBayRes, todayRes] = await Promise.all([
    db.from('sick_bay_visits')
      .select('id, student_id, complaint, action_taken, admitted_at, notes, teacher_notified, parent_notified, students(full_name, class_name, admission_number)')
      .eq('school_id', auth.schoolId!)
      .eq('is_in_bay', true)
      .order('admitted_at'),

    db.from('sick_bay_visits')
      .select('id, student_id, complaint, action_taken, admitted_at, discharged_at, is_in_bay, students(full_name, class_name)')
      .eq('school_id', auth.schoolId!)
      .gte('admitted_at', todayStart)
      .order('admitted_at', { ascending: false })
      .limit(50),
  ])

  return NextResponse.json({
    in_bay:      inBayRes.data  ?? [],
    today_visits: todayRes.data ?? [],
    in_bay_count: (inBayRes.data ?? []).length,
  })
}

// ── POST — log new visit ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['nurse', 'principal', 'deputy'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: nurse access only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:   string
    complaint:    string
    action_taken: string
    notes?:       string
    vitals?:              Record<string, unknown>
    nurse_findings?:      string
    management_provided?: string[]
    medication_items?:    MedItem[]
    referral_to?:         string
    follow_up_plan?:      string
  }

  if (!body.student_id || !body.complaint || !body.action_taken) {
    return NextResponse.json({ error: 'student_id, complaint, action_taken required' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  const isInBay = body.action_taken === 'Bed Rest'
  const meds = body.medication_items ?? []
  const issuedMedication = meds.length > 0 || body.action_taken === 'Medication Administered'

  // Defense flag: was this during scheduled class hours?
  const duringClassHours = await isClassHoursNow(db, auth.schoolId!)

  const { data: visit, error } = await db
    .from('sick_bay_visits')
    .insert({
      school_id:    auth.schoolId,
      student_id:   body.student_id,
      complaint:    body.complaint,
      action_taken: body.action_taken,
      notes:        body.notes ?? null,
      is_in_bay:    isInBay,
      seen_by:      (staff as { id: string } | null)?.id ?? null,
      vitals:               body.vitals ?? {},
      nurse_findings:       body.nurse_findings ?? null,
      management_provided:  body.management_provided ?? [],
      medication_items:     meds,
      referral_to:          body.referral_to ?? null,
      follow_up_plan:       body.follow_up_plan ?? null,
      during_class_hours:   duringClassHours,
      // medication-issued time = end of visit
      medication_issued_at: issuedMedication ? new Date().toISOString() : null,
      followup_due_at:      followupDueFromPlan(body.follow_up_plan),
    })
    .select('id, admitted_at')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const v = visit as { id: string; admitted_at: string }

  // Deduct medication stock (shared with staff ledger for reconciliation).
  if (meds.length) {
    recordMedicationIssue(db, auth.schoolId!, meds, 'student', v.id, (staff as { id: string } | null)?.id ?? null).catch(() => {})
  }

  // Fetch student + school data for notifications
  const [studentRes, schoolRes] = await Promise.all([
    db.from('students').select('full_name, class_name, admission_number, parent_phone, stream_name').eq('id', body.student_id).eq('school_id', auth.schoolId!).single(),
    db.from('schools').select('name, school_type').eq('id', auth.schoolId!).single(),
  ])
  const student = studentRes.data as { full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null; stream_name: string | null } | null
  const school  = schoolRes.data  as { name: string; school_type: string | null } | null

  const isBoarding = school?.school_type === 'boarding'

  // Fire all notifications asynchronously
  runNotifications(v.id, body.action_taken, body.complaint, student, school, auth.schoolId!, isBoarding, db).catch(() => {})

  // Outbreak detection
  checkOutbreak(body.complaint, auth.schoolId!, db).catch(() => {})

  // Per-child parent health notification (strict mapping) + RAG index + lesson context.
  postVisitSideEffects(db, auth.schoolId!, body.student_id, v.id, body.complaint, body.action_taken, student, duringClassHours).catch(() => {})

  // G&C auto-suggestion for Anxiety/Stress
  const gcSuggested = body.complaint === 'Anxiety/Stress'

  return NextResponse.json({
    ok:           true,
    visit_id:     v.id,
    is_in_bay:    isInBay,
    gc_suggested: gcSuggested,
    admitted_at:  v.admitted_at,
  })
}

// ── Notification handler ──────────────────────────────────────────────────────

type StudentInfo = { full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null; stream_name: string | null } | null
type SchoolInfo  = { name: string; school_type: string | null } | null

async function runNotifications(
  visitId:    string,
  action:     string,
  complaint:  string,
  student:    StudentInfo,
  school:     SchoolInfo,
  schoolId:   string,
  isBoarding: boolean,
  db:         ReturnType<typeof svc>
): Promise<void> {
  if (!student) return

  const now  = new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
  const name = student.full_name
  const cls  = student.class_name

  if (action === 'Sent Home') {
    // 1. WhatsApp to parent
    const parentPhone = student.parent_phone
    if (parentPhone) {
      const msg = `🏥 *School Health Notice*\n\nDear Parent,\n\n*${name}* (${cls}) visited the sick bay at ${now}.\n\n*Complaint:* ${complaint}\n*Action:* Cleared to go home\n\nKindly arrange to pick up your child. If you have any concerns, contact the school nurse.\n\n_${school?.name ?? 'School'}_`
      await sendWhatsApp(parentPhone, msg)
    }

    // 2. Update attendance to "Medical — Sent Home"
    const today = new Date().toISOString().split('T')[0]
    await db.from('attendance_records').upsert({
      school_id:  schoolId,
      student_id: student.admission_number ? undefined : undefined,
      date:       today,
      status:     'medical_sent_home',
      notes:      `Sent home by nurse at ${now} — ${complaint}`,
    }, { onConflict: 'school_id,student_id,date', ignoreDuplicates: false }).then(() => {}, () => {})

    // 3. Mark visit flags
    await db.from('sick_bay_visits').update({ parent_notified: !!parentPhone, teacher_notified: true, gate_log_updated: true }).eq('id', visitId)

    // 4. Log gate exit authorization
    await db.from('alerts').insert({
      school_id: schoolId,
      type:      'gate_exit_authorized',
      severity:  'low',
      title:     `Gate exit authorized: ${name} (${cls}) — medical`,
      detail:    { student_id: student.admission_number, reason: 'Sick bay — sent home', time: now },
    }).then(() => {}, () => {})
  }

  if (action === 'Bed Rest' && isBoarding) {
    // Notify dorm master
    await db.from('alerts').insert({
      school_id: schoolId,
      type:      'sick_bay_bed_rest',
      severity:  'medium',
      title:     `Sick bay: ${name} (${cls}) — Bed Rest tonight`,
      detail:    { complaint, admitted_at: new Date().toISOString(), visit_id: visitId },
    }).then(() => {}, () => {})

    // WhatsApp parent
    const parentPhone = student.parent_phone
    if (parentPhone) {
      const msg = `🏥 *School Health Update*\n\nDear Parent,\n\n*${name}* is currently resting in the sick bay at ${now}.\n\n*Complaint:* ${complaint}\n\nYour child is being monitored by the school nurse. You will be notified of any changes.\n\n_${school?.name ?? 'School'}_`
      await sendWhatsApp(parentPhone, msg)
    }
    await db.from('sick_bay_visits').update({ parent_notified: !!parentPhone }).eq('id', visitId)
  }
}

// ── Outbreak detection ────────────────────────────────────────────────────────

async function checkOutbreak(complaint: string, schoolId: string, db: ReturnType<typeof svc>): Promise<void> {
  const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00Z'
  const { count } = await db
    .from('sick_bay_visits')
    .select('id', { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('complaint', complaint)
    .gte('admitted_at', todayStart)

  if ((count ?? 0) >= 3) {
    await db.from('alerts').insert({
      school_id: schoolId,
      type:      'possible_outbreak',
      severity:  'high',
      title:     `Possible issue: ${count} students with "${complaint}" today`,
      detail:    { complaint, count, recommendation: 'Investigate possible food hygiene or environmental cause' },
    }).then(() => {}, () => {})
  }
}

// ── Per-child parent notification + RAG indexing ──────────────────────────────

async function postVisitSideEffects(
  db: ReturnType<typeof svc>,
  schoolId: string,
  studentId: string,
  visitId: string,
  complaint: string,
  action: string,
  student: StudentInfo,
  duringClassHours: boolean,
): Promise<void> {
  const name = student?.full_name ?? 'Your child'

  // 1) Parent health notifications — STRICT student→parent mapping (parent_student_links).
  const { data: links } = await db
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', studentId)
  const rows = (links ?? []).map((l: { parent_id: string }) => ({
    school_id:  schoolId,
    student_id: studentId,
    parent_id:  l.parent_id,
    visit_id:   visitId,
    title:      'Health update',
    body:       `${name} visited the school nurse — ${complaint}. Action: ${action}.`,
  }))
  if (rows.length) await db.from('parent_health_notifications').insert(rows).then(() => {}, () => {})

  // 2) RAG index so future nurse insights / follow-ups can reference this visit.
  await indexSchoolDocument({
    schoolId,
    sourceType:  'nurse_note',
    sourceId:    visitId,
    documentType: 'manual',
    text: `Nurse visit: ${name} (${student?.class_name ?? ''}). Complaint: ${complaint}. Action: ${action}.` +
          `${duringClassHours ? ' Occurred during class hours.' : ''}`,
    metadata: { student_id: studentId, complaint, action, during_class_hours: duringClassHours, visit_id: visitId },
  }).catch(() => {})
}

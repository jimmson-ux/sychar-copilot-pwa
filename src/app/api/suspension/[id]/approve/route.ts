// POST /api/suspension/[id]/approve — principal ONLY
// Approves a suspension_records draft: digital signature, PDF, SHA-256 hash,
// student status update via trigger, WhatsApp parent, SMS fallback.

export const dynamic = 'force-dynamic'

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendWhatsApp } from '@/lib/whatsapp'
import { sendSMS } from '@/lib/sms'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type RecordRow = {
  id: string; student_id: string; school_id: string;
  case_summary: string; status: string; proposed_by: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()

  const body = await req.json().catch(() => null) as {
    action:                 'approve' | 'edit' | 'request_more' | 'decline'
    editedLetter?:          string
    startDate?:             string
    endDate?:               string
    suspensionDays?:        number
    readmissionConditions?: string
    declineReason?:         string
  } | null

  if (!body?.action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  const { data: record } = await db
    .from('suspension_records')
    .select('id, student_id, school_id, case_summary, status, proposed_by')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!record) return NextResponse.json({ error: 'Suspension record not found' }, { status: 404 })

  const r = record as RecordRow

  if (r.status === 'approved') {
    return NextResponse.json({ error: 'Already approved' }, { status: 409 })
  }

  if (body.action === 'decline') {
    await db.from('suspension_records').update({
      case_summary: r.case_summary +
        `\n\nPrincipal note (${new Date().toISOString()}): ${body.declineReason ?? 'Returned for revision'}`,
    }).eq('id', id)
    return NextResponse.json({ ok: true, action: 'declined' })
  }

  if (body.action === 'request_more') {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'suspension_more_info',
      severity:  'medium',
      title:     'Principal requested more information for suspension case',
      detail:    { suspension_id: id },
    }).then(() => {}, () => {})
    return NextResponse.json({ ok: true, action: 'request_more' })
  }

  // approve / edit
  if (!body.startDate || !body.endDate) {
    return NextResponse.json({ error: 'startDate and endDate required for approval' }, { status: 400 })
  }

  const [studentRes, tenantRes] = await Promise.all([
    db.from('students')
      .select('full_name, class_name, admission_number, parent_phone')
      .eq('id', r.student_id)
      .single(),
    db.from('tenant_configs')
      .select('name')
      .eq('school_id', auth.schoolId!)
      .single(),
  ])

  const student = studentRes.data as {
    full_name: string; class_name: string | null;
    admission_number: string | null; parent_phone: string | null
  } | null
  const schoolName = (tenantRes.data as { name: string } | null)?.name ?? 'School'

  const approvedAt  = new Date().toISOString()
  const finalLetter = body.editedLetter ?? r.case_summary

  // SHA-256 covers all immutable fields
  const canonical = {
    suspension_id: id,
    student_id:    r.student_id,
    school_id:     r.school_id,
    case_summary:  r.case_summary,
    start_date:    body.startDate,
    end_date:      body.endDate,
    approved_by:   auth.userId,
    approved_at:   approvedAt,
  }
  const hash           = crypto.createHash('sha256')
    .update(JSON.stringify(canonical, Object.keys(canonical).sort()))
    .digest('hex')
  const signatureBlock = `SIGNED: ${auth.userId} | ${approvedAt} | ${hash.slice(0, 32).toUpperCase()}`

  // Generate PDF via edge function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  let pdfUrl: string | null = null
  try {
    const edgeRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        docType: 'suspension_letter',
        data: {
          schoolName,
          studentName:   student?.full_name ?? 'Unknown',
          className:     student?.class_name ?? '',
          admissionNo:   student?.admission_number ?? '',
          startDate:     body.startDate,
          endDate:       body.endDate,
          letterBody:    finalLetter,
          signatureBlock,
          documentHash:  hash,
          approvedAt,
        },
      }),
    })
    if (edgeRes.ok) {
      pdfUrl = ((await edgeRes.json()) as { url?: string }).url ?? null
    }
  } catch { /* pdf non-blocking */ }

  const days = Math.ceil(
    (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / 86400000
  ) + 1

  const { error: updateErr } = await db.from('suspension_records').update({
    status:                 'approved',
    approved_by:            auth.userId,
    approved_at:            approvedAt,
    start_date:             body.startDate,
    end_date:               body.endDate,
    suspension_days:        days,
    readmission_conditions: body.readmissionConditions ?? null,
    document_hash:          hash,
    letter_pdf_url:         pdfUrl,
  }).eq('id', id).eq('school_id', auth.schoolId!)

  if (updateErr) {
    console.error('[suspension/approve] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Notify teachers — no reason disclosed (privacy)
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'student_suspended',
    severity:  'medium',
    title:     `Student suspended — do not mark absent ${body.startDate} to ${body.endDate}`,
    detail:    { student_id: r.student_id, start_date: body.startDate, end_date: body.endDate },
  }).then(() => {}, () => {})

  // WhatsApp parent + SMS fallback
  let whatsappSent = false
  let smsSent      = false
  const parentPhone = student?.parent_phone

  if (parentPhone) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
    const msg = `*URGENT: Suspension Notice — ${schoolName}*\n\n${student?.full_name} has been suspended from ${fmt(body.startDate)} to ${fmt(body.endDate)}.\n\nA mandatory readmission meeting is required before your child returns to school. Please contact the school office urgently.${pdfUrl ? `\n\nLetter: ${pdfUrl}` : ''}`
    whatsappSent = await sendWhatsApp(parentPhone, msg)

    if (!whatsappSent) {
      smsSent = await sendSMS(
        parentPhone,
        `URGENT [${schoolName}]: ${student?.full_name} suspended ${body.startDate}–${body.endDate}. Contact school for readmission meeting.`
      )
    }

    await db.from('suspension_records').update({
      whatsapp_delivered:    whatsappSent,
      whatsapp_delivered_at: whatsappSent ? new Date().toISOString() : null,
      sms_sent:              smsSent,
    }).eq('id', id)
  }

  // Auto-suggest G&C referral on 3rd+ approval
  const { count: suspCount } = await db
    .from('suspension_records')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', auth.schoolId!)
    .eq('student_id', r.student_id)
    .eq('status', 'approved')

  if ((suspCount ?? 0) >= 3) {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'mandatory_gc_referral',
      severity:  'high',
      title:     `Mandatory G&C referral: ${student?.full_name} has ${suspCount} suspensions`,
      detail:    { student_id: r.student_id, suspension_count: suspCount },
    }).then(() => {}, () => {})
  }

  return NextResponse.json({
    success:              true,
    pdfUrl,
    hash,
    whatsappSent,
    smsSent,
    gcReferralSuggested:  (suspCount ?? 0) >= 3,
  })
}

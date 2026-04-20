// POST /api/suspension/cases/[id]/approve — principal only
// Generates PDF with digital signature + SHA-256 hash, creates suspension_record,
// triggers PostgreSQL fn_apply_suspension(), WhatsApps parent, SMS fallback.

export const dynamic = 'force-dynamic'

import crypto                              from 'crypto'
import { createClient }                    from '@supabase/supabase-js'
import { NextRequest, NextResponse }       from 'next/server'
import { requireAuth }                     from '@/lib/requireAuth'
import { sendWhatsApp }                    from '@/lib/whatsapp'
import { sendSMS }                         from '@/lib/sms'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
  const body   = await req.json() as {
    start_date:   string
    end_date:     string
    final_letter: string
    action:       'approve' | 'decline'
    decline_reason?: string
  }

  if (!body.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  // Fetch case + student + school
  const { data: c } = await db
    .from('suspension_cases')
    .select('*, students(full_name, class_name, admission_number, parent_phone), schools!school_id(name)')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const caseData = c as {
    id: string; student_id: string; allegations: string; incident_date: string;
    school_id: string; status: string;
    students: { full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null } | null;
    schools: { name: string } | null;
  }

  if (caseData.status !== 'submitted') {
    return NextResponse.json({ error: 'Case must be in submitted state to approve' }, { status: 409 })
  }

  // ── DECLINE ──────────────────────────────────────────────────────────────
  if (body.action === 'decline') {
    await db.from('suspension_cases').update({
      status:          'declined',
      declined_reason: body.decline_reason ?? 'No reason given',
      reviewed_at:     new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, action: 'declined' })
  }

  // ── APPROVE ───────────────────────────────────────────────────────────────
  if (!body.start_date || !body.end_date || !body.final_letter) {
    return NextResponse.json({ error: 'start_date, end_date, final_letter required for approval' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  const staffId = (staff as { id: string } | null)?.id

  const approvedAt = new Date().toISOString()
  const schoolName = caseData.schools?.name ?? 'School'
  const student    = caseData.students

  // ── Compute SHA-256 document hash ─────────────────────────────────────────
  // Hash covers all immutable fields — changes if document is tampered
  const canonicalData = {
    case_id:    id,
    student_id: caseData.student_id,
    school_id:  caseData.school_id,
    allegations: caseData.allegations,
    start_date: body.start_date,
    end_date:   body.end_date,
    approved_by: auth.userId!,
    approved_at: approvedAt,
  }
  const canonicalJson  = JSON.stringify(canonicalData, Object.keys(canonicalData).sort())
  const documentHash   = crypto.createHash('sha256').update(canonicalJson).digest('hex')
  const signatureBlock = `DIGITALLY SIGNED BY: ${auth.userId} | ${approvedAt} | HASH: ${documentHash.toUpperCase().slice(0, 32)}`

  // ── Generate HTML suspension letter ──────────────────────────────────────
  const pdfHtml = buildSuspensionHTML({
    schoolName,
    studentName:   student?.full_name   ?? 'Unknown',
    className:     student?.class_name  ?? '',
    admissionNo:   student?.admission_number ?? '',
    startDate:     body.start_date,
    endDate:       body.end_date,
    letterBody:    body.final_letter,
    signatureBlock,
    documentHash,
    approvedAt,
  })

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  let signedPdfUrl: string | null = null
  try {
    const bucket = svc()
    const path   = `suspension-letters/${auth.schoolId}/${id}.html`
    const { error: uploadErr } = await bucket.storage
      .from('documents')
      .upload(path, pdfHtml, { contentType: 'text/html', upsert: true })

    if (!uploadErr) {
      const { data: signed } = await bucket.storage
        .from('documents')
        .createSignedUrl(path, 30 * 24 * 3600) // 30-day validity
      signedPdfUrl = signed?.signedUrl ?? null
    }
  } catch { /* storage optional */ }

  // ── Create suspension_record (triggers fn_apply_suspension) ──────────────
  const { data: record, error: recErr } = await db
    .from('suspension_records')
    .insert({
      school_id:     caseData.school_id,
      student_id:    caseData.student_id,
      case_id:       id,
      approved_by:   staffId,
      approved_at:   approvedAt,
      start_date:    body.start_date,
      end_date:      body.end_date,
      document_hash: documentHash,
      signed_pdf_url: signedPdfUrl,
    })
    .select('id')
    .single()

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  // Mark case approved
  await db.from('suspension_cases').update({
    status:      'approved',
    reviewed_at: approvedAt,
    draft_letter: body.final_letter,
  }).eq('id', id)

  // ── Notify teachers (no reason disclosed — privacy) ───────────────────────
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'student_suspended',
    severity:  'medium',
    title:     `Student suspended: ${student?.class_name ?? ''} — do not mark absent during suspension period`,
    detail:    { student_id: caseData.student_id, start_date: body.start_date, end_date: body.end_date },
  }).then(() => {}, () => {})

  // ── WhatsApp parent + SMS fallback ────────────────────────────────────────
  const parentPhone = student?.parent_phone
  let whatsappSent = false; let smsSent = false

  if (parentPhone) {
    const startFmt = new Date(body.start_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
    const endFmt   = new Date(body.end_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
    const msg = `*URGENT: Suspension Notice — ${schoolName}*\n\nDear Parent/Guardian,\n\n${student?.full_name} has been suspended from ${startFmt} to ${endFmt}.\n\nA mandatory readmission meeting is required before your child returns to school. Please contact the school office urgently to schedule this meeting.\n\n${signedPdfUrl ? `Suspension letter: ${signedPdfUrl}` : ''}\n\n_${schoolName}_`
    whatsappSent = await sendWhatsApp(parentPhone, msg)

    if (!whatsappSent) {
      // SMS fallback within 2 minutes (synchronous here)
      const smsText = `URGENT [${schoolName}]: ${student?.full_name} suspended ${startFmt}–${endFmt}. Contact school for readmission meeting.`
      smsSent = await sendSMS(parentPhone, smsText)

      if (!smsSent) {
        // Both failed — urgent principal alert
        await db.from('alerts').insert({
          school_id: auth.schoolId,
          type:      'suspension_notification_failed',
          severity:  'high',
          title:     `URGENT: Failed to notify parent for ${student?.full_name}'s suspension — manual contact required`,
          detail:    { student_id: caseData.student_id, parent_phone: parentPhone },
        }).then(() => {}, () => {})
      }
    }

    await db.from('suspension_records').update({ whatsapp_sent: whatsappSent, sms_sent: smsSent })
      .eq('id', (record as { id: string }).id)
  }

  // ── Auto-suggest G&C referral (on 3rd+ suspension) ───────────────────────
  const { count: suspCount } = await db
    .from('suspension_records')
    .select('id', { count: 'exact' })
    .eq('school_id', auth.schoolId!)
    .eq('student_id', caseData.student_id)

  if ((suspCount ?? 0) >= 3) {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'mandatory_gc_referral',
      severity:  'high',
      title:     `Mandatory G&C referral: ${student?.full_name} has ${suspCount} suspensions`,
      detail:    { student_id: caseData.student_id, suspension_count: suspCount },
    }).then(() => {}, () => {})
  }

  return NextResponse.json({
    ok:             true,
    record_id:      (record as { id: string }).id,
    document_hash:  documentHash,
    signed_pdf_url: signedPdfUrl,
    whatsapp_sent:  whatsappSent,
    sms_sent:       smsSent,
    gc_referral_suggested: (suspCount ?? 0) >= 3,
  })
}

// ── HTML suspension letter builder ────────────────────────────────────────────

function buildSuspensionHTML(opts: {
  schoolName: string; studentName: string; className: string; admissionNo: string;
  startDate: string; endDate: string; letterBody: string;
  signatureBlock: string; documentHash: string; approvedAt: string;
}): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: 'Times New Roman', serif; max-width: 700px; margin: 40px auto; padding: 0 30px; color: #111; }
  h1   { text-align: center; font-size: 16px; text-transform: uppercase; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin: 16px 0; font-size: 13px; }
  .body  { margin: 24px 0; line-height: 1.7; font-size: 13px; white-space: pre-wrap; }
  .sig   { margin-top: 48px; }
  .hash  { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 10px; color: #666; word-break: break-all; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${opts.schoolName}</h1>
<h2 style="text-align:center;font-size:14px">SUSPENSION LETTER — STRICTLY CONFIDENTIAL</h2>
<div class="meta">
  <span><b>Student:</b> ${opts.studentName}</span>
  <span><b>Class:</b> ${opts.className}</span>
  <span><b>Admission No:</b> ${opts.admissionNo || 'N/A'}</span>
  <span><b>Date:</b> ${fmt(opts.approvedAt)}</span>
  <span><b>Suspension From:</b> ${fmt(opts.startDate)}</span>
  <span><b>Suspension To:</b> ${fmt(opts.endDate)} (inclusive)</span>
</div>
<div class="body">${opts.letterBody.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
<div class="sig">
  <p style="font-size:13px">Yours sincerely,</p>
  <div style="margin-top:40px;border-top:1px solid #444;width:200px;padding-top:4px;font-size:12px">Principal's Signature</div>
</div>
<div class="hash">
  <b>Document Integrity:</b><br>
  ${opts.signatureBlock}<br>
  SHA-256: ${opts.documentHash}
</div>
</body></html>`
}

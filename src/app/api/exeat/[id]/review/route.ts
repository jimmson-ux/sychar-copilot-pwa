// PATCH /api/exeat/[id]/review — principal/dean approve or reject exeat request

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const REVIEW_ROLES = new Set(['principal', 'deputy_principal', 'dean'])

function generateGateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!REVIEW_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null) as {
    action:           'approve' | 'reject'
    rejectionReason?: string
  } | null

  if (!body?.action || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  if (body.action === 'reject' && !body.rejectionReason?.trim()) {
    return NextResponse.json({ error: 'rejectionReason required when rejecting' }, { status: 400 })
  }

  const db  = svc()
  const now = new Date().toISOString()

  const { data: exeat, error: fetchErr } = await db
    .from('exeat_requests')
    .select(`
      id, status, student_id, parent_id, reason, destination, leave_date, return_date, leave_type,
      students!student_id ( full_name, class_name, parent_phone )
    `)
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !exeat) {
    return NextResponse.json({ error: 'Exeat request not found' }, { status: 404 })
  }

  type ExeatRow = {
    id: string; status: string; student_id: string; parent_id: string | null
    reason: string; destination: string; leave_date: string; return_date: string; leave_type: string
    students: { full_name: string; class_name: string; parent_phone: string | null } | { full_name: string; class_name: string; parent_phone: string | null }[] | null
  }
  const e = exeat as unknown as ExeatRow

  if (e.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${e.status}` }, { status: 409 })
  }

  const gateCode = body.action === 'approve' ? generateGateCode() : null

  const update = body.action === 'approve'
    ? { status: 'approved', approved_by: auth.userId, approved_at: now, gate_code: gateCode }
    : { status: 'rejected', approved_by: auth.userId, approved_at: now, rejection_reason: body.rejectionReason!.trim() }

  const { data, error } = await db
    .from('exeat_requests')
    .update(update)
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .select('id, status, gate_code, approved_at, rejection_reason')
    .single()

  if (error) {
    console.error('[exeat/review] PATCH error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const stu         = Array.isArray(e.students) ? e.students[0] : e.students
  const studentName = stu?.full_name ?? 'Student'
  const className   = stu?.class_name ?? ''
  const parentPhone = stu?.parent_phone ?? null

  // On approval, web-push the Teacher on Duty (+ today's duty teachers) that the
  // student has been authorised to leave, and log a gate-exit authorization so the
  // gatekeeper's live view shows it.
  if (body.action === 'approve') {
    const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: duty } = await db.from('duty_roster').select('teacher_id').eq('school_id', auth.schoolId!).eq('duty_date', today)
    const dutyIds = [...new Set((duty as { teacher_id: string }[] ?? []).map((d) => d.teacher_id).filter(Boolean))]
    const pushBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
    const payload = { title: 'Student authorised to leave', body: `${studentName} (${className}) has an APPROVED exeat. Gate code: ${gateCode}.`, url: '/dashboard/duty-appraisals', tag: 'exeat-approved', renotify: true }
    fetch(pushBase, { method: 'POST', headers, body: JSON.stringify({ audience: 'role', value: ['teacher_on_duty', 'tod'], school_id: auth.schoolId, payload }) }).catch(() => {})
    if (dutyIds.length) fetch(pushBase, { method: 'POST', headers, body: JSON.stringify({ audience: 'staff', value: dutyIds, school_id: auth.schoolId, payload }) }).catch(() => {})
    db.from('alerts').insert({
      school_id: auth.schoolId, type: 'gate_exit_authorized', severity: 'low',
      title: `Gate exit authorised: ${studentName} (${className}) — exeat`,
      detail: { exeat_id: id, gate_code: gateCode, student_id: e.student_id },
    }).then(() => {}, () => {})
  }

  // Notify parent via WhatsApp
  if (parentPhone) {
    const msg = body.action === 'approve'
      ? `*EXEAT APPROVED*\n\n${studentName} (${className})\nLeave: ${e.leave_date} → Return: ${e.return_date}\nDestination: ${e.destination}\nGate Code: *${gateCode}*\n\nPresent this code at the gate on departure.`
      : `*EXEAT REQUEST UPDATE*\n\n${studentName} (${className})\nYour exeat request for ${e.leave_date} has been *declined*.\n\nReason: ${body.rejectionReason!.trim()}\n\nContact the school for more information.`
    sendWhatsApp(parentPhone, msg).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true, exeat: data })
}

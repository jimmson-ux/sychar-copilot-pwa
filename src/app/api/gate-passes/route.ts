// POST /api/gate-passes — issue a premium gate pass with 6-char exit code
// Feature: gate_pass

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { tenantHasFeature } from '@/lib/tenantFeature'
import { sendWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ISSUE_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'dean'])

function generateExitCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ISSUE_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!await tenantHasFeature(auth.schoolId!, 'gate_pass')) {
    return NextResponse.json({ error: 'gate_pass feature not enabled for this school' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    studentId:                string
    reason:                   string
    destination:              string
    expectedReturn:           string   // ISO datetime
    expectedDurationMinutes?: number
    notifyParent?:            boolean
  } | null

  if (!body?.studentId || !body.reason?.trim() || !body.destination?.trim() || !body.expectedReturn) {
    return NextResponse.json({ error: 'studentId, reason, destination, expectedReturn required' }, { status: 400 })
  }

  const db = svc()

  // Check for active pass
  const { data: active } = await db
    .from('gate_passes')
    .select('id')
    .eq('student_id', body.studentId)
    .eq('school_id', auth.schoolId!)
    .eq('status', 'active')
    .maybeSingle()

  if (active) {
    return NextResponse.json({ error: 'Student already has an active gate pass' }, { status: 409 })
  }

  const { data: student } = await db
    .from('students')
    .select('id, full_name, class_name, admission_number, parent_phone')
    .eq('id', body.studentId)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  type StudentRow = { id: string; full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null }
  const s = student as StudentRow

  const { data: staff } = await db
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId!)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!staff) return NextResponse.json({ error: 'No staff record found' }, { status: 403 })

  type StaffRow = { id: string; full_name: string }
  const st = staff as StaffRow

  const exitCode = generateExitCode()
  const now      = new Date().toISOString()

  const { data: pass, error: passErr } = await db
    .from('gate_passes')
    .insert({
      school_id:                  auth.schoolId,
      student_id:                 body.studentId,
      reason:                     body.reason.trim(),
      destination:                body.destination.trim(),
      expected_return:            body.expectedReturn,
      expected_duration_minutes:  body.expectedDurationMinutes ?? 120,
      exit_code:                  exitCode,
      exit_time:                  now,
      status:                     'active',
      authorized_by:              st.id,
      parent_notified:            false,
      late_alerted:               false,
    })
    .select('id')
    .single()

  if (passErr) {
    console.error('[gate-passes] POST error:', passErr.message)
    return NextResponse.json({ error: passErr.message }, { status: 500 })
  }

  type PassRow = { id: string }
  const p = pass as PassRow

  const { data: school } = await db.from('schools').select('name, phone').eq('id', auth.schoolId!).single()
  const schoolName = (school as { name: string } | null)?.name ?? 'School'

  // Notify parent via WhatsApp
  if (s.parent_phone && body.notifyParent !== false) {
    const returnFmt = new Date(body.expectedReturn).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    const msg = `*EXIT PASS — ${schoolName}*\n\n${s.full_name} (${s.class_name}) has been authorized to leave school.\n\nReason: *${body.reason.trim()}*\nDestination: ${body.destination.trim()}\nExit Code: *${exitCode}*\nExpected Return: ${returnFmt}\nAuthorized by: ${st.full_name}`
    sendWhatsApp(s.parent_phone, msg).then(() => {
      db.from('gate_passes').update({ parent_notified: true }).eq('id', p.id).then(() => {}, () => {})
    }, () => {})
  }

  // Gate alert
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'gate_exit_authorized',
    severity:  'medium',
    title:     `EXIT: ${s.full_name} (${s.class_name}) — Code: ${exitCode} — ${body.reason.trim()}`,
    detail:    { pass_id: p.id, student_id: body.studentId, exit_code: exitCode, destination: body.destination.trim(), expected_return: body.expectedReturn },
  }).then(() => {}, () => {})

  return NextResponse.json({
    ok:              true,
    passId:          p.id,
    exitCode,
    exitTime:        now,
    expectedReturn:  body.expectedReturn,
  })
}

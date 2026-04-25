// GET  /api/gate/passes — list passes (DP admin / principal)
// POST /api/gate/passes — create a gate pass + notify parent + guard

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'
import { sendWhatsApp }            from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const REASONS = ['Medical', 'Fees', 'Family Emergency', 'Authorized Home Leave', 'School Errand'] as const

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['deputy', 'deputy_principal', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db     = svc()
  const status = req.nextUrl.searchParams.get('status') ?? 'pending'

  const { data, error } = await db
    .from('gate_passes')
    .select('id, reason, exit_pin, pin_expires_at, expected_return, status, exited_at, returned_at, created_at, students(full_name, class_name, admission_number), staff_records!authorized_by(full_name)')
    .eq('school_id', auth.schoolId!)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ passes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['deputy', 'deputy_principal', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: DP Admin or Principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:       string
    reason:           typeof REASONS[number]
    expected_return:  string   // ISO datetime
  }

  if (!body.student_id || !body.reason || !body.expected_return) {
    return NextResponse.json({ error: 'student_id, reason, expected_return required' }, { status: 400 })
  }

  if (!REASONS.includes(body.reason)) {
    return NextResponse.json({ error: `reason must be one of: ${REASONS.join(', ')}` }, { status: 400 })
  }

  // Fetch student
  const { data: student } = await db
    .from('students')
    .select('id, full_name, class_name, admission_number, parent_phone')
    .eq('id', body.student_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const s = student as { id: string; full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null }

  // Check for already-active pass
  const { data: activePass } = await db
    .from('gate_passes')
    .select('id')
    .eq('student_id', body.student_id)
    .eq('school_id', auth.schoolId!)
    .eq('status', 'pending')
    .single()

  if (activePass) return NextResponse.json({ error: 'Student already has an active gate pass' }, { status: 409 })

  const { data: staff } = await db
    .from('staff_records').select('id, full_name').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  const staffId   = (staff as { id: string; full_name: string } | null)?.id
  const staffName = (staff as { id: string; full_name: string } | null)?.full_name ?? 'Admin'

  if (!staffId) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  // Generate 4-digit PIN valid for 2 hours
  const pin        = generatePin()
  const pinExpiry  = new Date(Date.now() + 2 * 3600000).toISOString()
  const now        = new Date().toISOString()

  const { data: pass, error: passErr } = await db
    .from('gate_passes')
    .insert({
      school_id:       auth.schoolId,
      student_id:      body.student_id,
      reason:          body.reason,
      exit_pin:        pin,
      pin_expires_at:  pinExpiry,
      expected_return: body.expected_return,
      authorized_by:   staffId,
      status:          'pending',
    })
    .select('id')
    .single()

  if (passErr) return NextResponse.json({ error: passErr.message }, { status: 500 })

  const { data: school } = await db.from('schools').select('name, phone').eq('id', auth.schoolId!).single()
  const schoolName = (school as { name: string; phone: string | null } | null)?.name ?? 'School'
  const schoolPhone = (school as { name: string; phone: string | null } | null)?.phone ?? ''

  const returnFmt = new Date(body.expected_return).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const nowFmt    = new Date(now).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  // ── 1. WhatsApp parent ───────────────────────────────────────────────────
  if (s.parent_phone) {
    const parentMsg = `*EXIT AUTHORIZATION — ${schoolName}*\n\n${s.full_name} (${s.class_name}) has been authorized to leave school at ${nowFmt}.\n\nReason: *${body.reason}*\nExit Code: *${pin}*\nExpected Return: ${returnFmt}\nAuthorized by: ${staffName}\n\nIf you did NOT expect this, call ${schoolPhone} immediately.`
    sendWhatsApp(s.parent_phone, parentMsg).then(() => {}, () => {})
    await db.from('gate_passes').update({ parent_notified: true }).eq('id', (pass as { id: string }).id)
  }

  // ── 2. Guard push alert ──────────────────────────────────────────────────
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'gate_exit_authorized',
    severity:  'medium',
    title:     `EXIT AUTHORIZED: ${s.full_name} (${s.class_name}) — PIN: ${pin} — ${body.reason}`,
    detail:    { pass_id: (pass as { id: string }).id, student_id: body.student_id, pin, reason: body.reason, expected_return: body.expected_return },
  }).then(() => {}, () => {})

  return NextResponse.json({
    ok:              true,
    pass_id:         (pass as { id: string }).id,
    exit_pin:        pin,
    pin_expires_at:  pinExpiry,
    expected_return: body.expected_return,
  })
}

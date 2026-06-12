import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/exeat/staff — staff-initiated exeat (leave-out / exeat form).
 *
 * The Teacher on Duty and the School Nurse may ISSUE an exeat; it must be
 * APPROVED by the deputy principal or principal (reuses /api/exeat/[id]/review).
 * In rare/emergency cases the principal/deputy may self-approve at issue time.
 *
 * Body: { student_id, reason, destination, leave_date, return_date, leave_type?, emergency? }
 */

const ISSUER_ROLES = new Set([
  'nurse', 'teacher_on_duty', 'tod', 'dean_of_students', 'dean_of_studies',
  'deputy_dean_of_studies', 'deputy_principal', 'deputy_principal_admin', 'principal', 'super_admin',
])
const SELF_APPROVE_ROLES = new Set(['deputy_principal', 'deputy_principal_admin', 'principal', 'super_admin'])
const VALID_TYPES = ['day', 'overnight', 'weekend', 'holiday', 'medical', 'emergency']

function gateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let c = ''
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]
  return c
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ISSUER_ROLES.has(auth.subRole)) {
    return NextResponse.json(
      { error: 'Only the Teacher on Duty, Nurse, Dean, Deputy or Principal may issue an exeat.' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null) as {
    student_id?: string; reason?: string; destination?: string
    leave_date?: string; return_date?: string; leave_type?: string; emergency?: boolean
  } | null

  if (!body?.student_id || !body.reason?.trim() || !body.destination?.trim() || !body.leave_date || !body.return_date) {
    return NextResponse.json(
      { error: 'student_id, reason, destination, leave_date, return_date are required' },
      { status: 400 },
    )
  }
  if (new Date(body.leave_date) > new Date(body.return_date)) {
    return NextResponse.json({ error: 'leave_date must be before return_date' }, { status: 400 })
  }
  const leaveType = VALID_TYPES.includes(body.leave_type ?? '') ? body.leave_type! : 'day'

  const svc = createAdminSupabaseClient()

  // Student must belong to this school.
  const { data: student } = await svc
    .from('students')
    .select('id, full_name, class_name, parent_phone')
    .eq('id', body.student_id)
    .eq('school_id', auth.schoolId)
    .maybeSingle()
  if (!student) return NextResponse.json({ error: 'Student not found in this school' }, { status: 404 })

  const { data: issuer } = await svc
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  // Emergency self-approval only by deputy/principal.
  const selfApprove = Boolean(body.emergency) && SELF_APPROVE_ROLES.has(auth.subRole)
  const now = new Date().toISOString()

  const insertRow: Record<string, unknown> = {
    school_id: auth.schoolId,
    student_id: body.student_id,
    reason: body.reason.trim(),
    destination: body.destination.trim(),
    leave_date: body.leave_date,
    return_date: body.return_date,
    leave_type: leaveType,
    status: selfApprove ? 'approved' : 'pending',
    issued_by_role: auth.subRole,
    issuer_staff_id: (issuer as { id: string } | null)?.id ?? null,
  }
  if (selfApprove) {
    insertRow.approved_by = auth.userId
    insertRow.approved_at = now
    insertRow.gate_code = gateCode()
  }

  const { data, error } = await svc
    .from('exeat_requests')
    .insert(insertRow)
    .select('id, status, gate_code')
    .single()

  if (error) {
    console.error('[exeat/staff] POST', error)
    return NextResponse.json({ error: 'Failed to create exeat' }, { status: 500 })
  }

  const stu = student as { full_name: string; class_name: string | null }

  // Notify leadership (principal gets a summary of everything happening).
  await svc.from('alerts').insert({
    school_id: auth.schoolId,
    type: 'exeat_request',
    severity: selfApprove ? 'medium' : 'low',
    title: selfApprove
      ? `Emergency exeat issued & approved: ${stu.full_name} (${stu.class_name ?? ''}) by ${auth.subRole.replace(/_/g, ' ')}`
      : `Exeat issued for approval: ${stu.full_name} (${stu.class_name ?? ''}) by ${auth.subRole.replace(/_/g, ' ')}`,
    detail: { exeat_id: (data as { id: string }).id, student_id: body.student_id, reason: body.reason.trim(), leave_type: leaveType },
  }).then(() => {}, () => {})

  return NextResponse.json({
    ok: true,
    exeat_id: (data as { id: string }).id,
    status: (data as { status: string }).status,
    gate_code: (data as { gate_code: string | null }).gate_code ?? null,
    self_approved: selfApprove,
  })
}

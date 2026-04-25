// POST /api/parent/auth/otp/verify
// Body: { phone, otp, schoolCode }
// Verifies OTP, resolves parent's students, issues a signed JWT.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signParentJWT } from '@/lib/parent/parentJWT'

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('254')) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+254' + digits.slice(1)
  if (digits.length === 9) return '+254' + digits
  return '+' + digits
}

const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    phone?: string
    otp?: string
    schoolCode?: string
  }

  if (!body.phone?.trim() || !body.otp?.trim() || !body.schoolCode?.trim()) {
    return NextResponse.json({ error: 'phone, otp and schoolCode required' }, { status: 400 })
  }

  const phone      = normalizePhone(body.phone.trim())
  const schoolCode = body.schoolCode.trim().toUpperCase()
  const svc        = createAdminSupabaseClient()

  // Find most recent unused, non-expired OTP for this phone
  const { data: otpRow } = await svc
    .from('auth_rate_limits')
    .select('id, otp_code, expires_at, attempts, used')
    .eq('phone', phone)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otpRow) {
    return NextResponse.json({ error: 'No active OTP found. Please request a new code.' }, { status: 404 })
  }

  type OtpRow = { id: string; otp_code: string; expires_at: string; attempts: number; used: boolean }
  const row = otpRow as OtpRow

  // Check attempt limit
  if (row.attempts >= MAX_ATTEMPTS) {
    await svc.from('auth_rate_limits').update({ used: true }).eq('id', row.id)
    return NextResponse.json(
      { error: 'Too many failed attempts. Request a new OTP.' },
      { status: 429 }
    )
  }

  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    await svc.from('auth_rate_limits').update({ used: true }).eq('id', row.id)
    return NextResponse.json({ error: 'OTP has expired. Request a new code.' }, { status: 410 })
  }

  // Verify OTP
  if (row.otp_code !== body.otp.trim()) {
    await svc.from('auth_rate_limits').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    const remaining = MAX_ATTEMPTS - (row.attempts + 1)
    return NextResponse.json(
      { error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      { status: 401 }
    )
  }

  // Mark OTP used
  await svc.from('auth_rate_limits').update({ used: true }).eq('id', row.id)

  // Resolve school
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .eq('school_short_code', schoolCode)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 })
  }

  const schoolId   = (tenant as { school_id: string }).school_id
  const schoolName = (tenant as { name: string }).name

  // Fetch all students linked to this phone
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name, current_form, admission_no')
    .eq('school_id', schoolId)
    .or(`parent_phone.eq.${phone},parent2_phone.eq.${phone}`)
    .eq('is_active', true)

  type StudentRow = { id: string; full_name: string; class_name: string | null; current_form: string | null; admission_no: string | null }
  const studentList = (students ?? []) as StudentRow[]

  if (studentList.length === 0) {
    return NextResponse.json(
      { error: 'No students linked to this phone number at this school.' },
      { status: 404 }
    )
  }

  const studentIds = studentList.map(s => s.id)

  // Create or refresh parent session
  await svc.from('parent_sessions').update({ is_active: false })
    .eq('parent_phone', phone)
    .eq('school_id', schoolId)
    .eq('is_active', true)

  const { data: session } = await svc
    .from('parent_sessions')
    .insert({
      school_id:     schoolId,
      parent_phone:  phone,
      student_ids:   studentIds,
      otp_code:      null,
      otp_expires_at: null,
      is_active:     true,
      jwt_issued_at: new Date().toISOString(),
      last_seen_at:  new Date().toISOString(),
    })
    .select('id')
    .single()

  const sessionId = (session as { id: string } | null)?.id ?? crypto.randomUUID()

  const token = await signParentJWT({
    sub:         phone,
    school_id:   schoolId,
    student_ids: studentIds,
    session_id:  sessionId,
  })

  return NextResponse.json({
    success: true,
    token,
    session: {
      phone,
      schoolId,
      schoolName,
      studentIds,
      activeStudentId: studentIds[0],
    },
    students: studentList.map(s => ({
      id: s.id, name: s.full_name, class: s.class_name, form: s.current_form,
    })),
  })
}

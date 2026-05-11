import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signStaffJWT } from '@/lib/staff/staffJWT'

export const dynamic = 'force-dynamic'

/**
 * POST /api/staff/auth/verify
 *
 * Knowledge-based staff authentication — no Supabase auth cookie required.
 * Staff prove identity by knowing: school code + email + TSC/ID number.
 *
 * Body: { school_code, email, tsc_number }
 *       OR { school_code, email, id_number }
 *
 * Returns: { token, staff, school }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { school_code, email, tsc_number, id_number } = body as {
    school_code?: string
    email?:       string
    tsc_number?:  string
    id_number?:   string
  }

  if (!school_code?.trim()) {
    return NextResponse.json({ error: 'school_code is required' }, { status: 400 })
  }
  if (!email?.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  if (!tsc_number?.trim() && !id_number?.trim()) {
    return NextResponse.json(
      { error: 'Provide your TSC number or national ID' },
      { status: 400 },
    )
  }

  const svc = createAdminSupabaseClient()

  // Resolve school via slug or short_code (same logic as parent auth)
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .or(
      `slug.eq.${school_code.trim().toLowerCase()},school_short_code.eq.${school_code.trim().toUpperCase()}`,
    )
    .limit(1)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'School code not recognised' }, { status: 404 })
  }

  const schoolId   = tenant.school_id as string
  const schoolName = tenant.name as string

  // Find staff by school + email
  const { data: staffRows } = await svc
    .from('staff_records')
    .select('id, full_name, sub_role, class_id, user_id, tsc_number, id_number, photo_url, subject_specialization, is_active, can_login')
    .eq('school_id', schoolId)
    .ilike('email', email.trim())
    .limit(3)

  if (!staffRows?.length) {
    return NextResponse.json({ error: 'No staff record found for that email' }, { status: 404 })
  }

  const staff = staffRows[0] as {
    id: string; full_name: string; sub_role: string | null; class_id: string | null
    user_id: string | null; tsc_number: string | null; id_number: string | null
    photo_url: string | null; subject_specialization: string | null
    is_active: boolean | null; can_login: boolean | null
  }

  if (staff.is_active === false || staff.can_login === false) {
    return NextResponse.json({ error: 'Account is inactive. Contact your school admin.' }, { status: 403 })
  }

  // Verify second factor: TSC number OR national ID
  const tscMatch = tsc_number?.trim() && staff.tsc_number
    ? staff.tsc_number.trim().toLowerCase() === tsc_number.trim().toLowerCase()
    : false
  const idMatch  = id_number?.trim() && staff.id_number
    ? staff.id_number.trim() === id_number.trim()
    : false

  if (!tscMatch && !idMatch) {
    return NextResponse.json(
      { error: 'TSC number or ID does not match our records' },
      { status: 401 },
    )
  }

  const token = await signStaffJWT({
    sub:       staff.id,
    school_id: schoolId,
    user_id:   staff.user_id ?? '',
    role:      staff.sub_role ?? 'teacher',
    class_id:  staff.class_id ?? undefined,
  })

  return NextResponse.json({
    token,
    staff: {
      id:          staff.id,
      full_name:   staff.full_name,
      role:        staff.sub_role,
      class_id:    staff.class_id,
      photo_url:   staff.photo_url,
      subject:     staff.subject_specialization,
    },
    school: { id: schoolId, name: schoolName },
  })
}

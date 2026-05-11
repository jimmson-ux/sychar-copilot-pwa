import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signStaffJWT } from '@/lib/staff/staffJWT'

export const dynamic = 'force-dynamic'

/**
 * POST /api/staff/auth/verify
 *
 * Knowledge-based staff authentication — no Supabase auth cookie required.
 * Staff prove identity by knowing: email + TSC number OR national ID.
 * School is resolved automatically from their staff record.
 *
 * Body: { email, tsc_number }  OR  { email, id_number }
 *
 * Returns: { token, staff, school }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, tsc_number, id_number } = body as {
    email?:       string
    tsc_number?:  string
    id_number?:   string
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

  // Find staff by email — school is resolved from their record
  const { data: staffRows } = await svc
    .from('staff_records')
    .select('id, school_id, full_name, sub_role, class_id, user_id, tsc_number, id_number, photo_url, subject_specialization, is_active, can_login')
    .ilike('email', email.trim())
    .limit(3)

  if (!staffRows?.length) {
    return NextResponse.json({ error: 'No staff record found for that email' }, { status: 404 })
  }

  const staff = staffRows[0] as {
    id: string; school_id: string; full_name: string; sub_role: string | null
    class_id: string | null; user_id: string | null; tsc_number: string | null
    id_number: string | null; photo_url: string | null
    subject_specialization: string | null
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

  // Resolve school name from tenant_configs
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('name')
    .eq('school_id', staff.school_id)
    .single()

  const token = await signStaffJWT({
    sub:       staff.id,
    school_id: staff.school_id,
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
    school: { id: staff.school_id, name: (tenant?.name as string | null) ?? 'Your School' },
  })
}

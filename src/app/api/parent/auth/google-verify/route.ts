// POST /api/parent/auth/google-verify
// Authorization: Bearer <supabase_access_token>
// Body: { schoolCode: string }
//
// Verifies a Supabase Google OAuth token, matches the email to a student's
// parent_email in the given school, then issues a parent JWT.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signParentJWT } from '@/lib/parent/parentJWT'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Supabase token' }, { status: 401 })
  }
  const supabaseToken = authHeader.slice(7)

  const body = await req.json().catch(() => ({})) as { schoolCode?: string }
  const schoolCode = body.schoolCode?.trim().toUpperCase()
  if (!schoolCode) {
    return NextResponse.json({ error: 'schoolCode required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Verify the Supabase token and extract the email
  const { data: { user }, error: userErr } = await svc.auth.getUser(supabaseToken)
  if (userErr || !user?.email) {
    return NextResponse.json({ error: 'Invalid or expired Google token' }, { status: 401 })
  }
  const email = user.email.toLowerCase()

  // Resolve school from short code
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .eq('school_short_code', schoolCode)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'School not found. Check your school code.' }, { status: 404 })
  }
  const schoolId = (tenant as { school_id: string }).school_id

  // Find all students linked to this parent email in the school
  const { data: students } = await svc
    .from('students')
    .select('id')
    .eq('school_id', schoolId)
    .or(`parent_email.eq.${email},parent2_email.eq.${email}`)

  if (!students?.length) {
    return NextResponse.json(
      { error: 'This Google account is not registered at this school. Contact the school office.' },
      { status: 404 },
    )
  }

  const studentIds = students.map((s: { id: string }) => s.id)
  const ua         = (req.headers.get('user-agent') ?? '').slice(0, 120)
  const now        = new Date().toISOString()

  // Deactivate any previous sessions for this email+school
  await svc
    .from('parent_sessions')
    .update({ is_active: false })
    .eq('parent_phone', email)   // email stored in parent_phone column as the identifier
    .eq('school_id', schoolId)
    .eq('is_active', true)

  // Create a new session (Google auth — no OTP step)
  const { data: session } = await svc
    .from('parent_sessions')
    .insert({
      school_id:      schoolId,
      parent_phone:   email,     // identifier field (email for Google auth)
      student_ids:    studentIds,
      device_hint:    ua,
      is_active:      true,
      jwt_issued_at:  now,
      last_seen_at:   now,
    })
    .select('id')
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 })
  }

  const token = await signParentJWT({
    sub:         email,
    school_id:   schoolId,
    student_ids: studentIds,
    session_id:  (session as { id: string }).id,
  })

  return NextResponse.json({ token, student_ids: studentIds })
}

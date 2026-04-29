// POST /api/auth/emergency-otp/verify
// Body: { email, otp }
// Verifies a 6-digit emergency OTP issued via God Mode, returns Supabase action link.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { email?: string; otp?: string }
  const email = body.email?.trim().toLowerCase()
  const otp   = body.otp?.trim()

  if (!email || !otp) {
    return NextResponse.json({ error: 'email and otp required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Find auth user
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authUser = users.find(u => u.email?.toLowerCase() === email)
  if (!authUser) {
    return NextResponse.json({ success: false, reason: 'invalid_credentials' }, { status: 401 })
  }

  // Consume via consume_magic_link — emergency OTPs are stored as magic_links tokens
  const { data, error } = await svc.rpc('consume_magic_link', { p_token: otp })
  if (error || !data?.length) {
    return NextResponse.json({ success: false, reason: 'invalid_or_expired_otp' }, { status: 401 })
  }

  const row = data[0] as { user_id: string; school_id: string }
  // Verify OTP belongs to this user
  if (row.user_id !== authUser.id) {
    return NextResponse.json({ success: false, reason: 'otp_user_mismatch' }, { status: 401 })
  }

  const { data: staff } = await svc
    .from('staff_records')
    .select('id, sub_role, full_name, force_password_change')
    .eq('user_id', authUser.id)
    .single()

  const redirectTo = `${process.env.APP_URL ?? ''}/verify-magic?complete=1`
  const { data: linkData } = await svc.auth.admin.generateLink({
    type:    'magiclink',
    email,
    options: { redirectTo },
  })

  const actionLink = linkData?.properties?.action_link
  if (!actionLink) {
    return NextResponse.json({ success: false, reason: 'session_error' }, { status: 500 })
  }

  return NextResponse.json({
    success:             true,
    actionLink,
    staffId:             staff?.id,
    subRole:             staff?.sub_role,
    fullName:            staff?.full_name,
    forcePasswordChange: staff?.force_password_change ?? false,
  })
}

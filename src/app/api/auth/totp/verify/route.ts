// POST /api/auth/totp/verify
// Body: { email, token }
// Verifies a 6-digit TOTP code, returns a Supabase action link on success.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { verifyTOTP } from '@/lib/totp'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { email?: string; token?: string }
  const email = body.email?.trim().toLowerCase()
  const token = body.token?.trim()

  if (!email || !token) {
    return NextResponse.json({ error: 'email and token required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Find auth user by email
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authUser = users.find(u => u.email?.toLowerCase() === email)
  if (!authUser) {
    return NextResponse.json({ success: false, reason: 'invalid_credentials' }, { status: 401 })
  }

  // Fetch encrypted TOTP secret
  const { data: staff } = await svc
    .from('staff_records')
    .select('totp_secret, school_id, full_name, sub_role, force_password_change, id')
    .eq('user_id', authUser.id)
    .single()

  if (!staff?.totp_secret) {
    return NextResponse.json({ success: false, reason: 'totp_not_configured' }, { status: 400 })
  }

  const valid = verifyTOTP(token, staff.totp_secret)
  if (!valid) {
    return NextResponse.json({ success: false, reason: 'invalid_token' }, { status: 401 })
  }

  // Generate Supabase magic link so the browser can create a session
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
    staffId:             staff.id,
    subRole:             staff.sub_role,
    fullName:            staff.full_name,
    forcePasswordChange: staff.force_password_change ?? false,
  })
}

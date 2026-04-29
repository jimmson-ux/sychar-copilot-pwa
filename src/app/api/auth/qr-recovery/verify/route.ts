// POST /api/auth/qr-recovery/verify
// Body: { qrData }
// Teacher scans principal's QR → verify JWT → return Supabase action link.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

function getSecret(): Uint8Array {
  const s = process.env.TEACHER_TOKEN_SECRET ?? process.env.SYCHAR_QR_SECRET ?? ''
  return new TextEncoder().encode(s)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { qrData?: string }
  if (!body.qrData) return NextResponse.json({ error: 'qrData required' }, { status: 400 })

  let payload: { targetUserId: string; schoolId: string; type: string }
  try {
    const { payload: p } = await jwtVerify(body.qrData, getSecret())
    payload = p as typeof payload
  } catch {
    return NextResponse.json({ success: false, reason: 'invalid_or_expired_qr' }, { status: 401 })
  }

  if (payload.type !== 'qr_recovery') {
    return NextResponse.json({ success: false, reason: 'wrong_token_type' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  const { data: authUser } = await svc.auth.admin.getUserById(payload.targetUserId)
  if (!authUser?.user?.email) {
    return NextResponse.json({ success: false, reason: 'user_not_found' }, { status: 404 })
  }

  const { data: staff } = await svc
    .from('staff_records')
    .select('id, sub_role, full_name, force_password_change')
    .eq('user_id', payload.targetUserId)
    .single()

  const redirectTo = `${process.env.APP_URL ?? ''}/verify-magic?complete=1`
  const { data: linkData } = await svc.auth.admin.generateLink({
    type:    'magiclink',
    email:   authUser.user.email,
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

// POST /api/auth/qr-recovery/generate
// Body: { targetUserId }
// Principal-only: generates a signed JWT for QR recovery. Teacher scans to log in.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

function getSecret(): Uint8Array {
  const s = process.env.TEACHER_TOKEN_SECRET ?? process.env.SYCHAR_QR_SECRET ?? ''
  return new TextEncoder().encode(s)
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createAdminSupabaseClient()

  // Verify requester is principal or deputy
  const { data: principal } = await svc
    .from('staff_records')
    .select('school_id, sub_role')
    .eq('user_id', user.id)
    .single()

  if (!principal || !['principal','deputy_principal','super_admin'].includes(principal.sub_role ?? '')) {
    return NextResponse.json({ error: 'Forbidden — principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { targetUserId?: string }
  if (!body.targetUserId) {
    return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })
  }

  // Verify target is in the same school
  const { data: target } = await svc
    .from('staff_records')
    .select('id, full_name, school_id, sub_role, force_password_change')
    .eq('user_id', body.targetUserId)
    .eq('school_id', principal.school_id)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Target staff not found in your school' }, { status: 404 })
  }

  // Sign a 10-minute JWT
  const qrData = await new SignJWT({
    targetUserId: body.targetUserId,
    principalId:  user.id,
    schoolId:     principal.school_id,
    type:         'qr_recovery',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getSecret())

  return NextResponse.json({
    qrData,
    targetName: target.full_name,
    expiresIn:  600,
  })
}

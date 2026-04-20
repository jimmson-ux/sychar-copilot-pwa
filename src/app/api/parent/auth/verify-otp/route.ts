import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signParentJWT } from '@/lib/parent/parentJWT'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/auth/verify-otp
 * Body: { phone: string, otp: string, school_id: string }
 *
 * Step 3 of parent login:
 *   - Finds the active session for (phone, school_id)
 *   - Checks OTP matches and is not expired
 *   - Locks after 5 failed attempts (deactivates session)
 *   - Issues a signed Parent JWT containing school_id + student_ids (from DB)
 *
 * Response: { token: string, student_ids: string[] }
 */

const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { phone, otp, school_id } = body as {
    phone?: string
    otp?: string
    school_id?: string
  }

  if (!phone || !otp || !school_id) {
    return NextResponse.json(
      { error: 'phone, otp, and school_id are required' },
      { status: 400 },
    )
  }

  const svc = createAdminSupabaseClient()

  const { data: session } = await svc
    .from('parent_sessions')
    .select('id, otp_code, otp_expires_at, otp_attempts, student_ids')
    .eq('parent_phone', phone)
    .eq('school_id', school_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'No active OTP session found' }, { status: 404 })
  }

  // Check attempt limit
  if (session.otp_attempts >= MAX_ATTEMPTS) {
    await svc
      .from('parent_sessions')
      .update({ is_active: false })
      .eq('id', session.id)
    return NextResponse.json(
      { error: 'Too many failed attempts. Please request a new OTP.' },
      { status: 429 },
    )
  }

  // Check expiry
  if (new Date(session.otp_expires_at) < new Date()) {
    await svc
      .from('parent_sessions')
      .update({ is_active: false })
      .eq('id', session.id)
    return NextResponse.json({ error: 'OTP has expired' }, { status: 410 })
  }

  // Verify OTP
  if (session.otp_code !== otp.trim()) {
    await svc
      .from('parent_sessions')
      .update({ otp_attempts: session.otp_attempts + 1 })
      .eq('id', session.id)
    const remaining = MAX_ATTEMPTS - (session.otp_attempts + 1)
    return NextResponse.json(
      { error: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` },
      { status: 401 },
    )
  }

  // OTP verified — clear OTP, mark session active with jwt_issued_at
  const now = new Date().toISOString()
  await svc
    .from('parent_sessions')
    .update({
      otp_code:      null,
      otp_expires_at: null,
      jwt_issued_at:  now,
      last_seen_at:   now,
    })
    .eq('id', session.id)

  // Issue JWT — school_id and student_ids come exclusively from DB, not request body
  const token = await signParentJWT({
    sub:         phone,
    school_id:   school_id,
    student_ids: session.student_ids as string[],
    session_id:  session.id as string,
  })

  return NextResponse.json({
    token,
    student_ids: session.student_ids,
  })
}

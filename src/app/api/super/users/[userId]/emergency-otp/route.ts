// POST /api/super/users/[userId]/emergency-otp
// God Mode: generates a 6-digit emergency OTP for a locked-out staff member.
// Valid 5 minutes, single use.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { userId } = await params
  const db = adminClient()

  const { data: otp, error } = await db.rpc('generate_emergency_otp', {
    p_user_id: userId,
  })

  if (error || !otp) {
    return NextResponse.json({ error: 'Failed to generate OTP' }, { status: 500 })
  }

  void db.from('god_mode_audit').insert({
    actor_id:    auth.ctx.userId,
    actor_email: auth.ctx.email,
    action:      'emergency_otp_generated',
    entity_type: 'user',
    entity_id:   userId,
    meta:        { otp_issued: true },
  })

  return NextResponse.json({ otp })
}

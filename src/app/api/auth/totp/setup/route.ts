// POST /api/auth/totp/setup
// Generates a TOTP secret for the authenticated staff member.
// Returns { secret, qrCodeUrl } for display in the authenticator setup flow.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { generateTOTPSecret, getTOTPUri, encryptSecret } from '@/lib/totp'

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const secret     = generateTOTPSecret()
  const qrCodeUrl  = getTOTPUri(user.email ?? user.id, secret)
  const encrypted  = encryptSecret(secret)

  const svc = createAdminSupabaseClient()
  const { error } = await svc
    .from('staff_records')
    .update({ totp_secret: encrypted })
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Failed to save TOTP secret' }, { status: 500 })

  return NextResponse.json({ secret, qrCodeUrl })
}

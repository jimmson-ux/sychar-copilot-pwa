// POST /api/auth/magic-link/consume
// Body: { token }
// Marks the token used, generates a Supabase action link, stores it for polling device.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { token?: string }
  const token = body.token?.trim()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  // Consume via DB function (atomic)
  const { data, error } = await svc.rpc('consume_magic_link', { p_token: token })
  if (error || !data?.length) {
    return NextResponse.json({ success: false, reason: 'expired_or_used' }, { status: 400 })
  }

  const { user_id: userId } = data[0] as { user_id: string; school_id: string }

  // Get user email to generate Supabase action link
  const { data: authUser } = await svc.auth.admin.getUserById(userId)
  if (!authUser?.user?.email) {
    return NextResponse.json({ success: false, reason: 'user_not_found' }, { status: 404 })
  }

  // Generate a Supabase magic link — new device will follow this to get a session
  const redirectTo = `${process.env.APP_URL ?? ''}/verify-magic?complete=1`
  const { data: linkData } = await svc.auth.admin.generateLink({
    type:    'magiclink',
    email:   authUser.user.email,
    options: { redirectTo },
  })

  const actionLink = linkData?.properties?.action_link ?? null

  // Store action_link on the token row so the polling device can retrieve it
  if (actionLink) {
    await svc
      .from('magic_links')
      .update({ action_link: actionLink })
      .eq('token', token)
  }

  return NextResponse.json({ success: true })
}

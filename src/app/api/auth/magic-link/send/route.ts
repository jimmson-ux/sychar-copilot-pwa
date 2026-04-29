// POST /api/auth/magic-link/send
// Body: { email }
// Creates a magic link token, sends push notification to all registered devices.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { sendPush, type PushSubscriptionObject } from '@/lib/push'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { email?: string }
  const email = body.email?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  // Find user in auth.users by email
  const { data: { users }, error: listErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) return NextResponse.json({ error: 'Auth lookup failed' }, { status: 500 })

  const authUser = users.find(u => u.email?.toLowerCase() === email)
  if (!authUser) {
    // Return generic response to avoid user enumeration
    return NextResponse.json({ sent: true, method: 'push' })
  }

  // Find staff record
  const { data: staff } = await svc
    .from('staff_records')
    .select('id, school_id, full_name')
    .eq('user_id', authUser.id)
    .single()

  if (!staff) return NextResponse.json({ sent: true, method: 'push' })

  // Generate secure token
  const token     = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const ua        = req.headers.get('user-agent')?.slice(0, 80) ?? ''

  // Store magic link
  await svc.from('magic_links').insert({
    user_id:    authUser.id,
    school_id:  staff.school_id,
    token,
    token_type: 'push_approval',
    expires_at: expiresAt,
    device_hint: ua,
  })

  // Fetch all push subscriptions for this user
  const { data: subs } = await svc
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', authUser.id)

  const verifyUrl = `${process.env.APP_URL ?? ''}/verify-magic?t=${token}`

  let pushed = 0
  for (const sub of (subs ?? [])) {
    const subscription = sub.subscription as PushSubscriptionObject
    const result = await sendPush(subscription, {
      title:   'Sychar Login Request',
      body:    `Someone is trying to sign in as ${staff.full_name}. Tap to review.`,
      tag:     'magic-login',
      type:    'login_approval',
      url:     verifyUrl,
      token,
      actions: [
        { action: 'approve', title: '✅ Approve' },
        { action: 'deny',    title: '❌ Deny'    },
      ],
    })
    if (result.gone) {
      // Subscription expired — clean up
      await svc.from('push_subscriptions').delete().eq('id', sub.id)
    } else if (result.ok) {
      pushed++
    }
  }

  return NextResponse.json({
    sent:     true,
    method:   pushed > 0 ? 'push' : 'no_devices',
    token,                   // returned so the new device can poll status
    devices:  pushed,
  })
}

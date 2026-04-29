// POST /api/auth/push/subscribe
// Saves a VAPID push subscription for the authenticated staff member.
// Body: { subscription: PushSubscriptionJSON, deviceName?: string }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    subscription?: { endpoint: string; keys: { p256dh: string; auth: string } }
    deviceName?:   string
  }

  if (!body.subscription?.endpoint || !body.subscription.keys?.p256dh) {
    return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Fetch school_id from staff_records
  const { data: staff } = await svc
    .from('staff_records')
    .select('school_id')
    .eq('user_id', user.id)
    .single()

  if (!staff?.school_id) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  // Upsert by endpoint (avoid duplicate subscriptions)
  const { error } = await svc
    .from('push_subscriptions')
    .upsert({
      user_id:      user.id,
      school_id:    staff.school_id,
      subscription: body.subscription,
      device_name:  body.deviceName ?? req.headers.get('user-agent')?.slice(0, 80) ?? null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'user_id,subscription->endpoint' })

  if (error) {
    // If upsert fails due to no unique constraint, fall back to insert
    await svc.from('push_subscriptions').insert({
      user_id:      user.id,
      school_id:    staff.school_id,
      subscription: body.subscription,
      device_name:  body.deviceName ?? null,
    })
  }

  return NextResponse.json({ ok: true })
}

// GET /api/auth/push/subscribe — return VAPID public key for client
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? ''
  return NextResponse.json({ vapidPublicKey: key })
}

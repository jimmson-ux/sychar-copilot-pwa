// POST /api/push/subscribe
// Saves a teacher's VAPID push subscription endpoint.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const raw  = await req.json().catch(() => null) as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  } | null
  const body = raw ?? {}
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'endpoint, keys.p256dh, and keys.auth required' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        school_id:  auth.schoolId,
        staff_id:   staff.id,
        endpoint:   body.endpoint!,
        p256dh:     body.keys!.p256dh!,
        auth:       body.keys!.auth!,
        user_agent: req.headers.get('user-agent') ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,endpoint' }
    )

  if (error) {
    console.error('[push/subscribe] upsert error:', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET /api/push/subscribe?vapid_public_key=1 — returns the VAPID public key
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
  if (!key) return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 })
  return NextResponse.json({ vapid_public_key: key })
}

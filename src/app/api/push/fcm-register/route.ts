// POST /api/push/fcm-register
// Upserts an FCM registration token for the authenticated staff member.

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

  const raw = await req.json().catch(() => null) as {
    fcm_token?: string
    platform?:  string
  } | null

  const body = raw ?? {}
  if (!body.fcm_token) {
    return NextResponse.json({ error: 'fcm_token required' }, { status: 400 })
  }

  const platform = body.platform ?? 'web'
  if (!['web', 'android', 'ios'].includes(platform)) {
    return NextResponse.json({ error: 'platform must be web, android, or ios' }, { status: 400 })
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
    .from('fcm_tokens')
    .upsert(
      {
        school_id: auth.schoolId,
        staff_id:  staff.id,
        fcm_token: body.fcm_token,
        platform,
        is_active: true,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'staff_id,fcm_token' }
    )

  if (error) {
    console.error('[push/fcm-register] upsert error:', error)
    return NextResponse.json({ error: 'Failed to save FCM token' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/push/fcm-register — deactivates a token when the user revokes permission
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const raw = await req.json().catch(() => null) as { fcm_token?: string } | null
  if (!raw?.fcm_token) {
    return NextResponse.json({ error: 'fcm_token required' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  await admin
    .from('fcm_tokens')
    .update({ is_active: false })
    .eq('staff_id', staff.id)
    .eq('fcm_token', raw.fcm_token)

  return NextResponse.json({ ok: true })
}

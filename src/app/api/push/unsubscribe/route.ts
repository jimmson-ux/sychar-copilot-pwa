// DELETE /api/push/unsubscribe
// Removes a teacher's VAPID push subscription endpoint.

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

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { endpoint } = body as { endpoint?: string }
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

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
    .delete()
    .eq('staff_id', staff.id)
    .eq('endpoint', endpoint)

  if (error) {
    console.error('[push/unsubscribe] error:', error)
    return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

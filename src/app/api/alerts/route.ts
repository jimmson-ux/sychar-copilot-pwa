// GET  /api/alerts — fetch unread alerts for current user's role
// PATCH /api/alerts — bulk mark all as read

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db           = createAdminSupabaseClient()
  const searchParams = req.nextUrl.searchParams
  const severity     = searchParams.get('severity')
  const alertType    = searchParams.get('type')
  const unread       = searchParams.get('unread') !== 'false'

  // alerts table has both legacy 'type' and new 'alert_type' columns
  let query = db
    .from('alerts')
    .select('id, school_id, type, alert_type, title, message, severity, target_role, student_id, is_read, action_url, created_at, expires_at')
    .eq('school_id', auth.schoolId)
    .or(`target_role.is.null,target_role.eq.${auth.subRole}`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (unread)    query = query.eq('is_read', false)
  if (severity)  query = query.eq('severity', severity)
  if (alertType) query = query.eq('alert_type', alertType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })

  const alerts = data ?? []
  const counts = { info: 0, warning: 0, critical: 0, high: 0, medium: 0 }
  for (const a of alerts) {
    const s = (a as { severity: string }).severity as keyof typeof counts
    if (s in counts) counts[s]++
  }

  return NextResponse.json({ alerts, counts, total: alerts.length })
}

export async function PATCH() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()

  await db
    .from('alerts')
    .update({ is_read: true })
    .eq('school_id', auth.schoolId)
    .or(`target_role.is.null,target_role.eq.${auth.subRole}`)
    .eq('is_read', false)

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * Notification Centre — the in-app noticeboard at the bottom of EVERY staff dashboard
 * (teaching + non-teaching), all schools incl. future ones. The system sifts notices by
 * the viewer's role + recency; a notice is marked "acknowledged/noted" the moment the
 * user views it. Reads `staff_notifications` (school-RLS) + `staff_notification_reads`.
 *
 *   GET  /api/notifications/feed?limit=&unreadOnly=  → role+time-sifted feed w/ read flags
 *   PATCH { ids: [...] | id }                        → mark acknowledged (on view)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const svc = createAdminSupabaseClient()
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true'

  // Resolve the viewer's staff id (for read receipts).
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).maybeSingle()
  const staffId = (me as { id: string } | null)?.id ?? null

  // School feed, sifted by role: target_roles null/empty = everyone, else must include my sub_role.
  const { data: rows, error } = await svc.from('staff_notifications')
    .select('id, kind, title, body, data, target_roles, priority, category, student_id, from_role, created_at')
    .eq('school_id', auth.schoolId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })

  const role = auth.subRole
  const visible = (rows as any[] ?? []).filter((n) => {
    const tr: string[] | null = n.target_roles
    return !tr || tr.length === 0 || tr.includes(role) || tr.includes('all')
  })

  // Read receipts for this staff member.
  const ids = visible.map((n) => n.id)
  let readSet = new Set<string>()
  if (staffId && ids.length) {
    const { data: reads } = await svc.from('staff_notification_reads')
      .select('notification_id').eq('staff_id', staffId).in('notification_id', ids)
    readSet = new Set((reads as { notification_id: string }[] ?? []).map((r) => r.notification_id))
  }

  let feed = visible.map((n) => ({ ...n, acknowledged: readSet.has(n.id) }))
  if (unreadOnly) feed = feed.filter((n) => !n.acknowledged)
  feed = feed.slice(0, limit)

  return NextResponse.json({ feed, unread: visible.filter((n) => !readSet.has(n.id)).length })
}

// Leadership/secretary post a notice to the school noticeboard (role-targeted, sifted by
// the system to the right dashboards). Web-push fan-out is handled by the existing
// send-push flow; this populates the in-app Notification Centre.
const POSTERS = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'secretary', 'dean_of_studies', 'dean_of_students'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!POSTERS.has(auth.subRole) && !auth.subRole.startsWith('hod_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const b = await req.json().catch(() => ({})) as { title?: string; body?: string; target_roles?: string[]; category?: string; priority?: number; kind?: string }
  if (!b.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).maybeSingle()
  const { data, error } = await svc.from('staff_notifications').insert({
    school_id: auth.schoolId,
    kind: b.kind ?? 'notice',
    title: b.title.trim(),
    body: b.body ?? null,
    target_roles: Array.isArray(b.target_roles) && b.target_roles.length ? b.target_roles : null, // null = everyone
    priority: Math.min(Math.max(Number(b.priority ?? 0), 0), 3),
    category: b.category ?? 'general',
    from_user_id: (me as { id: string } | null)?.id ?? null,
    from_role: auth.subRole,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed to post' }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const b = await req.json().catch(() => ({})) as { ids?: string[]; id?: string }
  const ids = b.ids?.length ? b.ids : b.id ? [b.id] : []
  if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).maybeSingle()
  const staffId = (me as { id: string } | null)?.id
  if (!staffId) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const now = new Date().toISOString()
  const rows = ids.map((notification_id) => ({ notification_id, staff_id: staffId, read_at: now }))
  const { error } = await svc.from('staff_notification_reads').upsert(rows, { onConflict: 'notification_id,staff_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true, acknowledged: ids.length })
}

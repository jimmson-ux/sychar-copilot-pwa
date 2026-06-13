import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/secretary/correspondence — incoming/outgoing mail register (Oloolaiser secretary).
 *   GET  → register (optionally ?direction=incoming|outgoing)
 *   POST → log mail { direction, party, subject, delivery_method?, attachment_url?, correspondence_date?, status? }
 *   PATCH→ update status/assignment { id, status?, assigned_to? }
 */
const SEC = new Set(['secretary', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

async function staffId(svc: ReturnType<typeof createAdminSupabaseClient>, userId: string) {
  const { data } = await svc.from('staff_records').select('id').eq('user_id', userId).single()
  return (data as { id: string } | null)?.id ?? null
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  let q = svc.from('secretary_correspondence')
    .select('id, direction, party, subject, correspondence_date, delivery_method, attachment_url, status, assigned_to, notes')
    .eq('school_id', auth.schoolId).order('correspondence_date', { ascending: false }).limit(200)
  const dir = new URL(req.url).searchParams.get('direction')
  if (dir === 'incoming' || dir === 'outgoing') q = q.eq('direction', dir)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ correspondence: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (b.direction !== 'incoming' && b.direction !== 'outgoing') return NextResponse.json({ error: 'direction must be incoming|outgoing' }, { status: 400 })
  if (!b.party?.trim() || !b.subject?.trim()) return NextResponse.json({ error: 'party and subject required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from('secretary_correspondence').insert({
    school_id: auth.schoolId, direction: b.direction, party: b.party.trim(), subject: b.subject.trim(),
    correspondence_date: b.correspondence_date ?? undefined, delivery_method: b.delivery_method ?? null,
    attachment_url: b.attachment_url ?? null, status: b.status ?? (b.direction === 'outgoing' ? 'sent' : 'received'),
    notes: b.notes ?? null, created_by: await staffId(svc, auth.userId),
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed to log' }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.status) patch.status = b.status
  if (b.assigned_to !== undefined) patch.assigned_to = b.assigned_to
  const svc = createAdminSupabaseClient()
  const { error } = await svc.from('secretary_correspondence').update(patch).eq('id', b.id).eq('school_id', auth.schoolId)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

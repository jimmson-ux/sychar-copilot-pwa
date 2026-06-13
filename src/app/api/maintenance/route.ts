import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/maintenance — any staff reports a fault; assigned + verified (all schools).
 * GET list; POST { location, category, description, priority }; PATCH { id, status, assigned_to? }.
 */
const MANAGE = new Set(['principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin', 'secretary', 'storekeeper', 'procurement_officer'])

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from('maintenance_requests')
    .select('id, location, category, description, priority, status, assigned_to, photo_url, completed_at, verified_at, created_at')
    .eq('school_id', auth.schoolId).order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  if (!String(b.description ?? '').trim()) return NextResponse.json({ error: 'description required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).maybeSingle()
  const { data, error } = await svc.from('maintenance_requests').insert({
    school_id: auth.schoolId, reported_by: (me as { id: string } | null)?.id ?? null,
    location: b.location ?? null, category: b.category ?? null, description: String(b.description).trim(),
    priority: ['low', 'medium', 'high', 'emergency'].includes(String(b.priority)) ? b.priority : 'medium',
    photo_url: b.photo_url ?? null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { id?: string; status?: string; assigned_to?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).maybeSingle()
  const meId = (me as { id: string } | null)?.id ?? null
  const patch: Record<string, unknown> = {}
  if (b.assigned_to !== undefined) { patch.assigned_to = b.assigned_to; patch.status = 'assigned' }
  if (b.status && ['open', 'assigned', 'in_progress', 'completed', 'verified'].includes(b.status)) {
    patch.status = b.status
    if (b.status === 'completed') patch.completed_at = new Date().toISOString()
    if (b.status === 'verified') { patch.verified_by = meId; patch.verified_at = new Date().toISOString() }
  }
  const { error } = await svc.from('maintenance_requests').update(patch).eq('id', b.id).eq('school_id', auth.schoolId)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

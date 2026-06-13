import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/secretary/digital-desk — Principal's Digital Desk workflow.
 * Secretary uploads a document → Principal reviews → assigns an officer → tracks completion.
 *   GET  → desk items
 *   POST → { title, source?, document_url?, assigned_officer_id? }  (secretary)
 *   PATCH→ { id, status?, assigned_officer_id?, notes? }            (principal/secretary)
 */
const SEC = new Set(['secretary', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from('principal_digital_desk')
    .select('id, title, source, document_url, assigned_officer_id, status, notes, created_at')
    .eq('school_id', auth.schoolId).order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (!b.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()
  const { data, error } = await svc.from('principal_digital_desk').insert({
    school_id: auth.schoolId, title: b.title.trim(), source: b.source ?? null,
    document_url: b.document_url ?? null, assigned_officer_id: b.assigned_officer_id ?? null,
    status: 'pending', uploaded_by: (me as { id: string } | null)?.id ?? null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })

  // Alert the principal that a document awaits review.
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ audience: 'role', value: ['principal'], school_id: auth.schoolId, payload: { title: 'Document for review', body: b.title.trim(), url: '/dashboard/principal', tag: 'digital-desk', renotify: true } }),
  }).catch(() => {})
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.status) patch.status = b.status
  if (b.assigned_officer_id !== undefined) patch.assigned_officer_id = b.assigned_officer_id
  if (b.notes !== undefined) patch.notes = b.notes
  const svc = createAdminSupabaseClient()
  const { error } = await svc.from('principal_digital_desk').update(patch).eq('id', b.id).eq('school_id', auth.schoolId)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })

  // If assigned to an officer, notify them.
  if (b.assigned_officer_id) {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ audience: 'staff', value: b.assigned_officer_id, school_id: auth.schoolId, payload: { title: 'Action assigned to you', body: 'The principal has assigned you a document/action.', url: '/dashboard', tag: 'digital-desk-assign', renotify: true } }),
    }).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}

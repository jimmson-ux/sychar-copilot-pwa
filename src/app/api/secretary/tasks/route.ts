import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/** /api/secretary/tasks — internal task management. GET list; POST {title, assigned_to?, due_date?}; PATCH {id, status}. */
const SEC = new Set(['secretary', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from('secretary_tasks').select('id, title, assigned_to, due_date, status, created_at')
    .eq('school_id', auth.schoolId).order('due_date', { ascending: true, nullsFirst: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ tasks: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (!b.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()
  const { data, error } = await svc.from('secretary_tasks').insert({
    school_id: auth.schoolId, title: b.title.trim(), assigned_to: b.assigned_to ?? null,
    due_date: b.due_date ?? null, status: 'open', created_by: (me as { id: string } | null)?.id ?? null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { error } = await svc.from('secretary_tasks').update({ status: b.status === 'done' ? 'done' : 'open' }).eq('id', b.id).eq('school_id', auth.schoolId)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

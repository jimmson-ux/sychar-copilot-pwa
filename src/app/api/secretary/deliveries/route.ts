import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/** /api/secretary/deliveries — front-office deliveries register. GET list; POST {courier?, package_desc, recipient?}. */
const SEC = new Set(['secretary', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from('school_deliveries').select('id, courier, package_desc, recipient, received_by, received_at')
    .eq('school_id', auth.schoolId).order('received_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ deliveries: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!SEC.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (!b.package_desc?.trim()) return NextResponse.json({ error: 'package_desc required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()
  const { data, error } = await svc.from('school_deliveries').insert({
    school_id: auth.schoolId, courier: b.courier ?? null, package_desc: b.package_desc.trim(),
    recipient: b.recipient ?? null, received_by: (me as { id: string } | null)?.id ?? null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

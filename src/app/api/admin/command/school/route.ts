import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function getAuthedDb(req: NextRequest) {
  const db    = createAdminSupabaseClient()
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '')
  if (token) {
    const { data: { user } } = await db.auth.getUser(token)
    if (user) return { db, authed: true }
  }
  const sc = await createServerSupabaseClient()
  const { data: { user } } = await sc.auth.getUser()
  return { db, authed: !!user }
}

const EDITABLE = new Set([
  'name', 'county', 'sub_county', 'knec_code', 'student_count',
  'short_name', 'contact_name', 'contact_phone', 'contact_email', 'tier',
])

export async function PATCH(req: NextRequest) {
  const { db, authed } = await getAuthedDb(req)
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body?.school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { school_id, ...rest } = body as Record<string, unknown>

  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (EDITABLE.has(k) && v !== undefined && v !== '') patch[k] = v
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 })
  }

  const { error } = await db.from('schools').update(patch).eq('id', school_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If name changed, regenerate slug
  let newSlug: string | null = null
  if (patch.name) {
    const { data: slug } = await db.rpc('generate_slug_from_name', { p_name: patch.name })
    if (slug) {
      await db.from('tenant_configs').update({ slug }).eq('school_id', school_id)
      newSlug = slug
    }
  }

  return NextResponse.json({ ok: true, slug: newSlug })
}

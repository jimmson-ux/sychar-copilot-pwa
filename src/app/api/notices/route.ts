// GET  /api/notices          — list recent notices for school
// POST /api/notices          — create a new notice
// DELETE /api/notices?id=   — delete a notice (admin only)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

const ADMIN_ROLES = new Set([
  'principal', 'deputy_principal', 'deputy_principal_admin',
  'deputy_principal_discipline', 'dean_of_studies', 'deputy_dean',
])

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId } = auth
  const limit  = Number(req.nextUrl.searchParams.get('limit') ?? '20')
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0')

  const { data, error } = await svc()
    .from('notices')
    .select('id, title, content, target_audience, created_at, created_by')
    .eq('school_id', schoolId!)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ notices: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ADMIN_ROLES.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { title?: string; content?: string; target_audience?: string }

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: 'title and content required' }, { status: 400 })
  }

  const { data, error } = await svc()
    .from('notices')
    .insert({
      school_id:       auth.schoolId,
      title:           body.title.trim(),
      content:         body.content.trim(),
      target_audience: body.target_audience ?? 'all',
      created_by:      auth.userId,
    })
    .select('id, title, content, target_audience, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ADMIN_ROLES.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await svc()
    .from('notices')
    .delete()
    .eq('id', id)
    .eq('school_id', auth.schoolId!)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

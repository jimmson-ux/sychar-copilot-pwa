// GET  /api/super/schools/[schoolId]/slug?check=proposed-slug — availability check
// PATCH /api/super/schools/[schoolId]/slug — set or update a school's slug

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

const SLUG_RE = /^[a-z0-9][a-z0-9\-]{0,62}[a-z0-9]$/

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { schoolId } = await params
  const check = req.nextUrl.searchParams.get('check')

  if (!check) {
    return NextResponse.json({ error: 'check query param required' }, { status: 400 })
  }

  const candidate = check.trim().toLowerCase()
  if (!SLUG_RE.test(candidate)) {
    return NextResponse.json({ available: false, reason: 'invalid_format' })
  }

  const db = adminClient()
  const { data } = await db
    .from('tenant_configs')
    .select('school_id')
    .eq('slug', candidate)
    .neq('school_id', schoolId)
    .limit(1)
    .single()

  return NextResponse.json({ available: !data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ schoolId: string }> }
) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { schoolId } = await params
  const body = await req.json().catch(() => ({})) as { slug?: string }
  const slug = body.slug?.trim().toLowerCase()

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'Invalid slug format. Use lowercase letters, numbers, hyphens. Min 2 chars.' },
      { status: 422 }
    )
  }

  const db = adminClient()

  // Check uniqueness (excluding this school)
  const { data: existing } = await db
    .from('tenant_configs')
    .select('school_id')
    .eq('slug', slug)
    .neq('school_id', schoolId)
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
  }

  const { error } = await db
    .from('tenant_configs')
    .update({ slug })
    .eq('school_id', schoolId)

  if (error) {
    return NextResponse.json({ error: 'Failed to update slug' }, { status: 500 })
  }

  return NextResponse.json({
    ok:  true,
    slug,
    url: `https://${slug}.sychar.co.ke`,
  })
}

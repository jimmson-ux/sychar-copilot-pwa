// GET  /api/magazine/content — list content for a school (public with school_code, or auth)
// POST /api/magazine/content — create content item (principal)
// PATCH /api/magazine/content — approve / feature / update (principal)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const SECTIONS = ['about', 'highlights', 'achievements', 'arts', 'sports', 'academics', 'leadership', 'community'] as const

export async function GET(req: NextRequest) {
  const db         = svc()
  const schoolCode = req.nextUrl.searchParams.get('school_code')
  const section    = req.nextUrl.searchParams.get('section')
  const publicView = !!schoolCode

  let schoolId = req.nextUrl.searchParams.get('school_id')

  if (publicView && !schoolId) {
    const { data: school } = await db.from('schools').select('id').eq('school_code', schoolCode!).single()
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    schoolId = (school as { id: string }).id
  }

  if (!schoolId) {
    const auth = await requireAuth()
    if (auth.unauthorized) return auth.unauthorized
    schoolId = auth.schoolId!
  }

  let query = db
    .from('magazine_content')
    .select('id, section, title, body, image_url, featured, approved, parental_consent, tags, published_at, created_at')
    .eq('school_id', schoolId)
    .eq('parental_consent', true)
    .order('featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(60)

  if (publicView) query = query.eq('approved', true).neq('image_status', 'removed')
  if (section)    query = query.eq('section', section)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Group by section for public view
  if (publicView) {
    const bySect: Record<string, unknown[]> = {}
    for (const item of (data ?? [])) {
      const s = (item as { section: string }).section
      if (!bySect[s]) bySect[s] = []
      bySect[s].push(item)
    }
    return NextResponse.json({ sections: bySect })
  }

  return NextResponse.json({ content: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    section:           typeof SECTIONS[number]
    title:             string
    body?:             string
    image_url?:        string
    featured?:         boolean
    tags?:             string[]
    student_ids?:      string[]
    parental_consent?: boolean  // default true; false if revoked
  }

  if (!body.section || !body.title) {
    return NextResponse.json({ error: 'section and title required' }, { status: 400 })
  }

  if (!SECTIONS.includes(body.section)) {
    return NextResponse.json({ error: `section must be one of: ${SECTIONS.join(', ')}` }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  const { data, error } = await db
    .from('magazine_content')
    .insert({
      school_id:        auth.schoolId,
      section:          body.section,
      title:            body.title.trim(),
      body:             body.body?.trim()       ?? null,
      image_url:        body.image_url          ?? null,
      image_status:     body.image_url ? 'ok' : 'none',
      featured:         body.featured           ?? false,
      approved:         true,
      approved_by:      (staff as { id: string } | null)?.id ?? null,
      approved_at:      new Date().toISOString(),
      parental_consent: body.parental_consent   ?? true,
      student_ids:      body.student_ids        ?? [],
      tags:             body.tags               ?? [],
      published_at:     new Date().toISOString(),
    })
    .select('id, section, title')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true, content: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    id:                string
    featured?:         boolean
    approved?:         boolean
    parental_consent?: boolean
    title?:            string
    body?:             string
    image_url?:        string
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing } = await db
    .from('magazine_content').select('id, school_id').eq('id', body.id).eq('school_id', auth.schoolId!).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.featured          !== undefined) updates.featured          = body.featured
  if (body.approved          !== undefined) updates.approved          = body.approved
  if (body.title             !== undefined) updates.title             = body.title.trim()
  if (body.body              !== undefined) updates.body              = body.body.trim()
  if (body.image_url         !== undefined) {
    updates.image_url         = body.image_url
    updates.image_status      = 'ok'
    updates.image_retry_count = 0
  }
  if (body.parental_consent  !== undefined) {
    updates.parental_consent  = body.parental_consent
    // Immediate removal if consent revoked
    if (!body.parental_consent) {
      updates.image_url    = null
      updates.image_status = 'removed'
      updates.approved     = false
    }
  }

  await db.from('magazine_content').update(updates).eq('id', body.id)
  return NextResponse.json({ ok: true })
}

// GET /api/parent/schools — public school directory for the parent PWA
// No auth required. Returns schools that have a slug (published on Sychar).

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const svc = createAdminSupabaseClient()

  const { data, error } = await svc
    .from('tenant_configs')
    .select('school_id, name, slug, school_short_code, county, logo_url')
    .not('slug', 'is', null)
    .order('name')

  if (error) {
    return NextResponse.json({ error: 'Failed to load schools' }, { status: 500 })
  }

  return NextResponse.json(
    { schools: data ?? [] },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } }
  )
}

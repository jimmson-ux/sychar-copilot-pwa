import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/notices
 * Returns school notices targeted at parents, ordered by publish date desc.
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const svc = createAdminSupabaseClient()

  const { data, error } = await svc
    .from('notices')
    .select('id, title, body, category, published_at, expires_at, attachment_url')
    .eq('school_id', parent.schoolId)
    .in('audience', ['parents', 'all'])
    .lte('published_at', new Date().toISOString())
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .order('published_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: 'Failed to load notices' }, { status: 500 })

  return NextResponse.json({ notices: data ?? [] })
}

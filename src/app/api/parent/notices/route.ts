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

  // Remote schema may use `content`/`target_audience`/`created_at` instead of
  // `body`/`audience`/`published_at` — query permissively and normalise.
  const { data } = await svc
    .from('notices')
    .select('id, title, content, body, category, target_audience, audience, created_at, published_at, expires_at')
    .eq('school_id', parent.schoolId)
    .order('created_at', { ascending: false })
    .limit(30)

  const now = new Date().toISOString()
  const notices = (data ?? [])
    .filter((n: Record<string, unknown>) => {
      const audience = String(n.target_audience ?? n.audience ?? 'all')
      return audience === 'parents' || audience === 'all'
    })
    .filter((n: Record<string, unknown>) => {
      const exp = n.expires_at as string | null
      return !exp || exp >= now
    })
    .map((n: Record<string, unknown>) => ({
      id:           n.id,
      title:        n.title,
      body:         n.content ?? n.body ?? '',
      category:     n.category ?? 'General',
      published_at: n.published_at ?? n.created_at,
    }))

  return NextResponse.json({ notices })
}

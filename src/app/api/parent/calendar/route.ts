import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns school calendar events visible to parents.
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const p    = req.nextUrl.searchParams
  const from = p.get('from') ?? new Date().toISOString().slice(0, 10)
  const to   = p.get('to')   ?? new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10)

  const svc = createAdminSupabaseClient()

  const { data, error } = await svc
    .from('calendar_events')
    .select('id, title, description, event_date, end_date, category, is_holiday, location')
    .eq('school_id', parent.schoolId)
    .in('audience', ['parents', 'all', 'school'])
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date')

  if (error) return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 })

  return NextResponse.json({ events: data ?? [] })
}

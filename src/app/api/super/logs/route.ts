export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const page    = Math.max(0, parseInt(searchParams.get('page') ?? '0'))
  const limit   = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const action  = searchParams.get('action')
  const search  = searchParams.get('q')

  const db = adminClient()
  let query = db
    .from('god_mode_audit')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (action) query = query.eq('action', action)
  if (search) query = query.ilike('actor_email', `%${search}%`)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ logs: data ?? [], total: count ?? 0, page, limit })
}

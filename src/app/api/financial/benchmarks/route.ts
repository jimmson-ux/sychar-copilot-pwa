// GET /api/financial/benchmarks — any authenticated staff

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()

  const { data, error } = await db
    .from('regional_benchmarks')
    .select('region_name, metric_name, metric_value, school_count, updated_at')
    .order('region_name')

  if (error) return NextResponse.json({ error: 'Failed to fetch benchmarks' }, { status: 500 })

  return NextResponse.json({ benchmarks: data ?? [] })
}

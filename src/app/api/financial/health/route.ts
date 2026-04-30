// GET /api/financial/health — principal + bursar + deputy only

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set(['principal', 'bursar', 'deputy_principal', 'deputy_principal_academic'])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — principal or bursar only' }, { status: 403 })
  }

  const db = createAdminSupabaseClient()

  // Latest health record for this school
  const { data: health } = await db
    .from('school_financial_health_log')
    .select('*')
    .eq('school_id', auth.schoolId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  // Regional benchmarks
  const { data: benchmarks } = await db
    .from('regional_benchmarks')
    .select('region_name, metric_name, metric_value, school_count, updated_at')
    .order('region_name')

  // Unread financial alerts
  const { data: financialAlerts } = await db
    .from('alerts')
    .select('*')
    .eq('school_id', auth.schoolId)
    .in('alert_type', ['financial_leak', 'fee_collection_low'])
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    health:     health ?? null,
    benchmarks: benchmarks ?? [],
    alerts:     financialAlerts ?? [],
  })
}

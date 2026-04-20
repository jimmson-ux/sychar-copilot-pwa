import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()
  const { data: sub } = await db
    .from('school_subscriptions')
    .select('status, tier, expiry_date, grace_period_days')
    .eq('school_id', auth.schoolId)
    .single()

  if (!sub) return NextResponse.json({ status: 'trial' })

  return NextResponse.json({
    status:            sub.status,
    tier:              sub.tier,
    expiry_date:       sub.expiry_date,
    grace_period_days: sub.grace_period_days,
  })
}

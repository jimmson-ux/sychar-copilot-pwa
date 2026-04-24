// GET /api/gate-passes/active — guard scanner view: all active passes today
// No complex auth needed — verified by schoolId from token

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()

  const now    = new Date()
  const todayNairobi = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }))
    .toISOString().split('T')[0]

  const { data, error } = await db
    .from('gate_passes')
    .select(`
      id, exit_code, reason, destination, status,
      exit_time, expected_return, actual_return, late_alerted,
      students!student_id ( full_name, class_name, admission_number, photo_url )
    `)
    .eq('school_id', auth.schoolId!)
    .eq('status', 'active')
    .gte('exit_time', `${todayNairobi}T00:00:00`)
    .order('exit_time', { ascending: false })

  if (error) {
    console.error('[gate-passes/active] GET error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ passes: data ?? [] })
}

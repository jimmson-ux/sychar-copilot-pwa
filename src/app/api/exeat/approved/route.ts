// GET /api/exeat/approved — guard scanner: approved exeats for today's departures
// Minimal auth — guard just needs to be authenticated staff of the school

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()

  const dateParam = req.nextUrl.searchParams.get('date')
  const today = dateParam ?? new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }).split(',')[0]

  const { data, error } = await db
    .from('exeat_requests')
    .select(`
      id, gate_code, destination, leave_date, return_date, leave_type, status,
      students!student_id ( full_name, class_name, admission_number, photo_url )
    `)
    .eq('school_id', auth.schoolId!)
    .eq('status', 'approved')
    .eq('leave_date', today)
    .order('leave_date', { ascending: true })

  if (error) {
    console.error('[exeat/approved] GET error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ approved: data ?? [], date: today })
}

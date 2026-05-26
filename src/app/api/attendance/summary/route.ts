import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }   from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/attendance/summary?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const admin = getAdmin()

  const { data, error } = await admin
    .from('daily_attendance_summary')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('attendance_date', date)
    .order('class_name')

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ date, summary: data ?? [] })
}

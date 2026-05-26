import { createClient }              from '@supabase/supabase-js'
import { NextRequest, NextResponse }  from 'next/server'
import { requireAuth }                from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/attendance/class/[classId]/[date]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classId: string; date: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { classId, date } = await params
  const admin = getAdmin()

  const { data, error } = await admin
    .from('student_qr_attendance')
    .select(`
      id, student_id, scan_status, scanned_at,
      students!student_id ( full_name, admission_number )
    `)
    .eq('school_id', auth.schoolId)
    .eq('scan_date', date)
    .order('scanned_at')

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Filter client-side by class (timetable_period join would be heavier)
  return NextResponse.json({ classId, date, records: data ?? [] })
}

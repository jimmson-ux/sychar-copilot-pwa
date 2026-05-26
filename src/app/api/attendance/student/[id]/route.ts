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

// GET /api/attendance/student/[id]?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const url    = req.nextUrl
  const from   = url.searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const to     = url.searchParams.get('to')   ?? new Date().toISOString().slice(0, 10)

  const admin = getAdmin()
  const { data, error } = await admin
    .from('student_qr_attendance')
    .select(`
      id, scan_date, scan_status, scanned_at,
      timetable_periods!timetable_period_id ( subject, class_name, period_number )
    `)
    .eq('school_id', auth.schoolId)
    .eq('student_id', id)
    .gte('scan_date', from)
    .lte('scan_date', to)
    .order('scan_date', { ascending: false })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Compute summary
  const records  = data ?? []
  const present  = records.filter((r) => r.scan_status === 'Present').length
  const late     = records.filter((r) => r.scan_status === 'Late').length
  const absent   = records.filter((r) => r.scan_status === 'Absent').length
  const total    = records.length
  const rate     = total > 0 ? Math.round(((present + late) / total) * 100) : null

  return NextResponse.json({ studentId: id, from, to, records, summary: { present, late, absent, total, rate } })
}

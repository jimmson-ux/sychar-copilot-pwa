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

// GET /api/duty/remarks?week=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const week  = req.nextUrl.searchParams.get('week') ?? new Date().toISOString().slice(0, 10)
  const admin = getAdmin()

  const { data, error } = await admin
    .from('duty_remarks')
    .select(`
      id, duty_date, category, remark, severity,
      requires_followup, resolved_at, created_at,
      staff_records!teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('duty_week_start', week)
    .order('duty_date', { ascending: false })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ week, remarks: data ?? [] })
}

// POST /api/duty/remarks  — Teacher on Duty submits daily remark
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  let body: {
    category:        string
    remark:          string
    severity?:       string
    requiresFollowup?: boolean
    dutyDate?:       string
    dutyWeekStart:   string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const VALID_CATEGORIES = ['Attendance','Discipline','Infrastructure','Safety','General','Incident']
  if (!VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('duty_remarks')
    .insert({
      school_id:        auth.schoolId,
      teacher_id:       auth.userId,
      duty_date:        body.dutyDate  ?? new Date().toISOString().slice(0, 10),
      duty_week_start:  body.dutyWeekStart,
      category:         body.category,
      remark:           body.remark,
      severity:         body.severity         ?? 'Normal',
      requires_followup: body.requiresFollowup ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ remark: data })
}

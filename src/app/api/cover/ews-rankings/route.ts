import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'
import { requireAuth }   from '@/lib/requireAuth'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/cover/ews-rankings
// Returns all teachers ranked by EWS score ascending (lowest workload first).
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const ALLOWED = ['deputy_principal','deputy_principal_academic','dean_of_studies','principal','super_admin']
  if (!ALLOWED.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('teacher_ews')
    .select(`
      teacher_id, ews_score, invigilation_count, cover_count,
      gate_duty_count, assembly_duty_count, last_duty_date,
      staff_records!teacher_id ( full_name, department, sub_role )
    `)
    .eq('school_id', auth.schoolId)
    .order('ews_score', { ascending: true })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ rankings: data ?? [] })
}

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

// GET /api/aptitude/at-risk
// Returns students in the 'Support' aptitude group needing intervention.
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const admin = getAdmin()
  const { data, error } = await admin
    .from('student_aptitude')
    .select(`
      student_id, aptitude_group, normalized_aptitude_score,
      percentile_rank, last_updated,
      students!student_id ( full_name, admission_number, class_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('aptitude_group', 'Support')
    .order('normalized_aptitude_score', { ascending: true })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ atRisk: data ?? [], count: data?.length ?? 0 })
}

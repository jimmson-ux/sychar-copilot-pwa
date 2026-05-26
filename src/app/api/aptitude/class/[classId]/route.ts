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

// GET /api/aptitude/class/[classId]
// Returns Extension/Core/Support breakdown for all students in a class.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { classId } = await params
  const admin = getAdmin()

  // Fetch students in class with their aptitude records
  const { data: students } = await admin
    .from('students')
    .select('id, full_name, admission_number')
    .eq('school_id', auth.schoolId)
    .or(`class_id.eq.${classId},class_name.eq.${classId}`)
    .eq('is_active', true)

  if (!students?.length) return NextResponse.json({ classId, students: [], summary: {} })

  const studentIds = students.map((s) => s.id)

  const { data: aptitudes } = await admin
    .from('student_aptitude')
    .select('student_id, aptitude_group, normalized_aptitude_score, percentile_rank, last_updated')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)

  const aptitudeMap = new Map((aptitudes ?? []).map((a) => [a.student_id, a]))

  const enriched = students.map((s) => ({
    ...s,
    aptitude: aptitudeMap.get(s.id) ?? {
      aptitude_group: 'Core',
      normalized_aptitude_score: 0,
      percentile_rank: null,
    },
  }))

  const summary = {
    Extension: enriched.filter((s) => s.aptitude.aptitude_group === 'Extension').length,
    Core:      enriched.filter((s) => s.aptitude.aptitude_group === 'Core').length,
    Support:   enriched.filter((s) => s.aptitude.aptitude_group === 'Support').length,
    total:     enriched.length,
  }

  return NextResponse.json({ classId, students: enriched, summary })
}

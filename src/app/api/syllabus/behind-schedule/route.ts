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

// GET /api/syllabus/behind-schedule
// Returns topics where expected_week < current ISO week and status != 'Completed'.
// AMBER = 1 week behind, RED = 2+ weeks behind.
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const admin      = getAdmin()
  const now        = new Date()
  // ISO week number
  const startOfYear = new Date(now.getFullYear(), 0, 4)
  const currentWeek = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  )

  const { data, error } = await admin
    .from('syllabus_progress')
    .select(`
      id, class_id, class_name, status,
      syllabus_topics!topic_id (
        topic_name, subject, class_level, expected_week, expected_term
      ),
      staff_records!teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .not('status', 'in', '("Completed","Skipped")')

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const behind = (data ?? [])
    .map((row) => {
      const topic    = row.syllabus_topics as { expected_week: number; topic_name: string; subject: string; class_level: string } | null
      const weeksLate = topic ? Math.max(0, currentWeek - (topic.expected_week ?? currentWeek)) : 0
      return { ...row, weeksLate, flag: weeksLate >= 2 ? 'RED' : weeksLate >= 1 ? 'AMBER' : null }
    })
    .filter((r) => r.flag !== null)
    .sort((a, b) => b.weeksLate - a.weeksLate)

  return NextResponse.json({ currentWeek, behind })
}

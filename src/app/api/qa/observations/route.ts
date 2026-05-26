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

const QA_ROLES = ['qaso','qa_officer','principal','deputy_principal','deputy_principal_academic','super_admin']

// GET /api/qa/observations?teacherId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const url        = req.nextUrl
  const teacherId  = url.searchParams.get('teacherId')
  const from       = url.searchParams.get('from')
  const to         = url.searchParams.get('to')

  const admin = getAdmin()
  let query = admin
    .from('qa_observations')
    .select(`
      id, observation_date, overall_score,
      lesson_preparation, content_accuracy, teaching_aids_used,
      student_engagement, time_management, classroom_management,
      strengths, areas_for_improvement, recommended_actions,
      shared_with_teacher, shared_with_principal,
      teacher_response, teacher_responded_at,
      observer:staff_records!observer_id ( full_name ),
      teacher:staff_records!teacher_id  ( full_name, department )
    `)
    .eq('school_id', auth.schoolId)
    .order('observation_date', { ascending: false })

  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (from)      query = query.gte('observation_date', from)
  if (to)        query = query.lte('observation_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ observations: data ?? [] })
}

// POST /api/qa/observations  — QA officer submits observation form
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!QA_ROLES.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    teacherId:            string
    timetablePeriodId?:   string
    observationDate:      string
    lessonPreparation:    number
    contentAccuracy:      number
    teachingAidsUsed:     number
    studentEngagement:    number
    timeManagement:       number
    classroomManagement:  number
    strengths?:           string
    areasForImprovement?: string
    recommendedActions?:  string[]
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('qa_observations')
    .insert({
      school_id:              auth.schoolId,
      observer_id:            auth.userId,
      teacher_id:             body.teacherId,
      timetable_period_id:    body.timetablePeriodId ?? null,
      observation_date:       body.observationDate,
      lesson_preparation:     body.lessonPreparation,
      content_accuracy:       body.contentAccuracy,
      teaching_aids_used:     body.teachingAidsUsed,
      student_engagement:     body.studentEngagement,
      time_management:        body.timeManagement,
      classroom_management:   body.classroomManagement,
      strengths:              body.strengths ?? null,
      areas_for_improvement:  body.areasForImprovement ?? null,
      recommended_actions:    body.recommendedActions ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ observation: data })
}

// PATCH /api/qa/observations  — share with teacher or principal
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!QA_ROLES.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { id: string; shareWithTeacher?: boolean; shareWithPrincipal?: boolean }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = getAdmin()
  const update: Record<string, boolean> = {}
  if (body.shareWithTeacher   !== undefined) update.shared_with_teacher   = body.shareWithTeacher
  if (body.shareWithPrincipal !== undefined) update.shared_with_principal = body.shareWithPrincipal

  const { error } = await admin
    .from('qa_observations')
    .update(update)
    .eq('id', body.id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

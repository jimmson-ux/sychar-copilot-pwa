// GET  /api/lesson-plans — filtered by role (own / dept / all)
// POST /api/lesson-plans — create a new plan

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const HOD_ROLES  = new Set(['hod_sciences','hod_arts','hod_languages','hod_mathematics','hod_social_sciences','hod_technical','hod_pathways'])
const ADMIN_ROLES = new Set(['principal','deputy_principal','deputy_principal_academic','dean_of_studies'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db     = createAdminSupabaseClient()
  const params = req.nextUrl.searchParams
  const term   = params.get('term')
  const year   = params.get('year') ?? '2025/2026'
  const status = params.get('status')

  // Resolve staff record id for teacher-scoped queries
  const { data: staffRow } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  let query = db
    .from('lesson_plans')
    .select(`
      id, subject_name, class_name, stream_name, term, academic_year,
      week_number, lesson_number, topic, sub_topic, status,
      ai_generated, submitted_at, approved_at, hod_comment,
      created_at, updated_at,
      staff_records!teacher_id(full_name, sub_role)
    `)
    .eq('school_id', auth.schoolId)
    .eq('academic_year', year)
    .order('created_at', { ascending: false })
    .limit(200)

  // Scope by role
  if (ADMIN_ROLES.has(auth.subRole) || HOD_ROLES.has(auth.subRole)) {
    // HODs and above see all plans for the school
  } else if (staffRow?.id) {
    // Teachers see only their own
    query = query.eq('teacher_id', staffRow.id)
  }

  if (term)   query = query.eq('term', parseInt(term))
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch lesson plans' }, { status: 500 })

  return NextResponse.json({ plans: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  if (!body.subject_name || !body.class_name) {
    return NextResponse.json({ error: 'subject_name and class_name are required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  const { data: staffRow } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  if (!staffRow?.id) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const submit = body.submit === true
  const isReflection = body.reflection_pct != null || body.reflection_went_well || body.reflection_challenges

  const { data, error } = await db
    .from('lesson_plans')
    .insert({
      school_id:            auth.schoolId,
      teacher_id:           staffRow.id,
      subject_name:         body.subject_name,
      class_name:           body.class_name,
      stream_name:          body.stream_name ?? null,
      term:                 body.term ?? null,
      academic_year:        body.academic_year ?? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      week_number:          body.week_number ?? null,
      lesson_number:        body.lesson_number ?? null,
      topic:                body.cbc_strand ?? body.topic,
      sub_topic:            body.cbc_sub_strand ?? body.sub_topic ?? null,
      specific_outcomes:    body.specific_outcomes ?? null,
      learning_experiences: body.learning_experiences ?? null,
      learning_resources:   Array.isArray(body.learning_resources)
                              ? JSON.stringify(body.learning_resources)
                              : (body.learning_resources ?? null),
      assessment_methods:   body.assessment_methods ?? null,
      time_allocation_mins: body.time_allocation_mins ?? 40,
      curriculum_type:      body.curriculum_type === 'CBC' ? 'CBC' : '844',
      cbc_strand:           body.cbc_strand ?? null,
      cbc_sub_strand:       body.cbc_sub_strand ?? null,
      // Structured CBC / 8-4-4 fields
      date_taught:          body.date_taught ?? now.slice(0, 10),
      period_number:        body.period_number ?? null,
      roll_present:         body.roll_present ?? null,
      roll_total:           body.roll_total ?? null,
      slo_cognitive:        body.slo_cognitive ?? null,
      slo_psychomotor:      body.slo_psychomotor ?? null,
      slo_affective:        body.slo_affective ?? null,
      key_inquiry_question: body.key_inquiry_question ?? null,
      core_competencies:    Array.isArray(body.core_competencies) ? body.core_competencies : [],
      values_core:          Array.isArray(body.values_core) ? body.values_core : [],
      pcis:                 Array.isArray(body.pcis) ? body.pcis : [],
      instructional_obj_1:  body.instructional_obj_1 ?? null,
      instructional_obj_2:  body.instructional_obj_2 ?? null,
      cross_cutting_issues: Array.isArray(body.cross_cutting_issues) ? body.cross_cutting_issues : [],
      homework:             body.homework ?? null,
      reflection_pct:       body.reflection_pct ?? null,
      reflection_went_well: body.reflection_went_well ?? null,
      reflection_challenges: body.reflection_challenges ?? null,
      reflection_at:        isReflection ? now : null,
      status:               submit ? 'submitted' : 'draft',
      submitted_at:         submit ? now : null,
      ai_generated:         false,
      lessons_count:        1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { id, action } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = createAdminSupabaseClient()
  const now = new Date().toISOString()

  // HOD approval / rejection
  if (action === 'approve' || action === 'reject') {
    const { error } = await db.from('lesson_plans').update({
      status:      action === 'approve' ? 'approved' : 'rejected',
      hod_comment: body.hod_comment ?? null,
      approved_at: action === 'approve' ? now : null,
    }).eq('id', id as string).eq('school_id', auth.schoolId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Teacher reflection update
  const { reflection_pct, reflection_went_well, reflection_challenges } = body
  const { error } = await db.from('lesson_plans').update({
    reflection_pct:        reflection_pct ?? null,
    reflection_went_well:  reflection_went_well ?? null,
    reflection_challenges: reflection_challenges ?? null,
    reflection_at:         now,
  }).eq('id', id as string).eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

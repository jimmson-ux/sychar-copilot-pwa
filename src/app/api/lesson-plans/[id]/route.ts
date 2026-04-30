// PATCH /api/lesson-plans/[id] — submit | approve | reject | update

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const HOD_ROLES   = new Set(['hod_sciences','hod_arts','hod_languages','hod_mathematics','hod_social_sciences','hod_technical','hod_pathways'])
const ADMIN_ROLES = new Set(['principal','deputy_principal','deputy_principal_academic','dean_of_studies'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id }  = await params
  const body    = await req.json().catch(() => ({})) as Record<string, unknown>
  const action  = body.action as string | undefined

  const db = createAdminSupabaseClient()

  // Verify the plan belongs to this school
  const { data: plan } = await db
    .from('lesson_plans')
    .select('id, teacher_id, status, school_id')
    .eq('id', id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const { data: staffRow } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  let update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (action === 'submit') {
    if (plan.teacher_id !== staffRow?.id) {
      return NextResponse.json({ error: 'Only the author can submit' }, { status: 403 })
    }
    update = { ...update, status: 'submitted', submitted_at: new Date().toISOString() }

  } else if (action === 'approve') {
    if (!HOD_ROLES.has(auth.subRole) && !ADMIN_ROLES.has(auth.subRole)) {
      return NextResponse.json({ error: 'HOD or above required to approve' }, { status: 403 })
    }
    update = {
      ...update,
      status:      'approved',
      approved_by: staffRow?.id ?? null,
      approved_at: new Date().toISOString(),
      hod_comment: body.comment ?? null,
    }

  } else if (action === 'reject') {
    if (!HOD_ROLES.has(auth.subRole) && !ADMIN_ROLES.has(auth.subRole)) {
      return NextResponse.json({ error: 'HOD or above required to reject' }, { status: 403 })
    }
    if (!body.comment) return NextResponse.json({ error: 'Rejection requires a comment' }, { status: 400 })
    update = { ...update, status: 'rejected', hod_comment: body.comment }

  } else {
    // General field update — teachers editing their own draft
    if (plan.teacher_id !== staffRow?.id && !ADMIN_ROLES.has(auth.subRole)) {
      return NextResponse.json({ error: 'Cannot edit another teacher\'s plan' }, { status: 403 })
    }
    const editable = [
      'topic','sub_topic','specific_outcomes','learning_experiences',
      'learning_resources','assessment_methods','teacher_edited_plan',
      'time_allocation_mins','cbc_strand','cbc_sub_strand','file_url',
    ]
    for (const f of editable) {
      if (f in body) update[f] = body[f]
    }
  }

  const { data, error } = await db
    .from('lesson_plans')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}

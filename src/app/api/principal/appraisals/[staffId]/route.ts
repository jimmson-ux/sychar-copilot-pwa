// GET   /api/principal/appraisals/[staffId] — single staff appraisal detail
// PATCH /api/principal/appraisals/[staffId] — save remarks + share with teacher

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const { staffId } = await params
  const db          = svc()
  const body        = await req.json() as {
    term_id:             string
    principal_remarks?:  string
    share_with_teacher?: boolean
    // Pass computed scores to save/update the record
    punctuality_score?:  number
    completion_score?:   number
    velocity_score?:     number
    outcome_score?:      number
    compliance_score?:   number
    overall_score?:      number
    rating?:             string
  }

  if (!body.term_id) return NextResponse.json({ error: 'term_id required' }, { status: 400 })

  // Verify staff belongs to school
  const { data: staff } = await db
    .from('staff_records').select('id, full_name').eq('id', staffId).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const upsertData: Record<string, unknown> = {
    school_id:   auth.schoolId,
    staff_id:    staffId,
    term_id:     body.term_id,
    updated_at:  new Date().toISOString(),
  }
  if (body.principal_remarks  !== undefined) upsertData.principal_remarks  = body.principal_remarks
  if (body.share_with_teacher !== undefined) upsertData.shared_with_teacher = body.share_with_teacher
  if (body.punctuality_score  !== undefined) upsertData.punctuality_score  = body.punctuality_score
  if (body.completion_score   !== undefined) upsertData.completion_score   = body.completion_score
  if (body.velocity_score     !== undefined) upsertData.velocity_score     = body.velocity_score
  if (body.outcome_score      !== undefined) upsertData.outcome_score      = body.outcome_score
  if (body.compliance_score   !== undefined) upsertData.compliance_score   = body.compliance_score
  if (body.overall_score      !== undefined) upsertData.overall_score      = body.overall_score
  if (body.rating             !== undefined) upsertData.rating             = body.rating

  const { error } = await db
    .from('staff_appraisals')
    .upsert(upsertData, { onConflict: 'school_id,staff_id,term_id' })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Notify teacher if sharing
  if (body.share_with_teacher) {
    await db.from('alerts').insert({
      school_id:  auth.schoolId,
      type:       'appraisal_shared',
      severity:   'low',
      title:      `Your ${body.term_id} appraisal has been shared by the principal`,
      detail:     { staff_id: staffId, term_id: body.term_id, rating: body.rating },
      target_staff_id: staffId,
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true })
}

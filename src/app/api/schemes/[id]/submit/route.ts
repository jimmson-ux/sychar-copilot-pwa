// PATCH /api/schemes/[id]/submit — teacher submits scheme to HOD for review

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set([
  'teacher', 'class_teacher', 'form_teacher', 'subject_teacher',
  'hod', 'senior_teacher',
])

type SchemeRow = { id: string; status: string; teacher_id: string }
type StaffRow  = { id: string }

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: teacher or HOD only' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const staffId = (staff as StaffRow).id

  const { data: scheme } = await db
    .from('schemes_of_work_new')
    .select('id, status, teacher_id')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!scheme) return NextResponse.json({ error: 'Scheme not found' }, { status: 404 })

  const s = scheme as SchemeRow

  if (s.teacher_id !== staffId && !['hod', 'senior_teacher'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: not your scheme' }, { status: 403 })
  }

  if (s.status !== 'draft' && s.status !== 'rejected') {
    return NextResponse.json(
      { error: `Cannot submit scheme with status '${s.status}'` },
      { status: 409 }
    )
  }

  await db.from('schemes_of_work_new').update({
    status:     'submitted',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  // Notify HOD
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'scheme_submitted',
    severity:  'low',
    title:     'Scheme of Work submitted for HOD review',
    detail:    { scheme_id: id, teacher_id: staffId },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true })
}

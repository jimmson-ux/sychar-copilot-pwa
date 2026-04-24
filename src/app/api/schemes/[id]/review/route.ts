// PATCH /api/schemes/[id]/review — HOD approves or rejects a submitted scheme

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendSMS } from '@/lib/sms'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set([
  'hod', 'deputy_hod', 'senior_teacher',
  'dean_of_studies', 'deputy_principal_academics',
])

type SchemeRow = {
  id: string; teacher_id: string; status: string;
  subject_name: string; class_name: string; term: number; academic_year: string
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: HOD only' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()

  const body = await req.json().catch(() => null) as {
    action:  'approve' | 'reject'
    comment: string
  } | null

  if (!body?.action || !body.comment?.trim()) {
    return NextResponse.json({ error: 'action and comment required' }, { status: 400 })
  }
  if (!['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const { data: scheme } = await db
    .from('schemes_of_work_new')
    .select('id, teacher_id, status, subject_name, class_name, term, academic_year')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!scheme) return NextResponse.json({ error: 'Scheme not found' }, { status: 404 })

  const s = scheme as SchemeRow

  if (s.status !== 'submitted') {
    return NextResponse.json(
      { error: `Scheme must be 'submitted' to review (current: '${s.status}')` },
      { status: 409 }
    )
  }

  const { data: hodStaff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  const hodId = (hodStaff as { id: string } | null)?.id ?? null

  const newStatus = body.action === 'approve' ? 'approved' : 'rejected'
  const now       = new Date().toISOString()

  await db.from('schemes_of_work_new').update({
    status:      newStatus,
    hod_comment: body.comment.trim(),
    approved_by: body.action === 'approve' ? hodId : null,
    approved_at: body.action === 'approve' ? now   : null,
    updated_at:  now,
  }).eq('id', id)

  // On approval update document_compliance
  if (body.action === 'approve') {
    await db.from('document_compliance').upsert({
      school_id:          auth.schoolId,
      teacher_id:         s.teacher_id,
      term:               s.term,
      academic_year:      s.academic_year,
      scheme_submitted:   true,
      scheme_submitted_at: now,
      scheme_approved:    true,
      updated_at:         now,
    }, { onConflict: 'teacher_id,term,academic_year' })
  }

  // SMS teacher with HOD comment
  const { data: teacher } = await db
    .from('staff_records').select('full_name, phone_number').eq('id', s.teacher_id).single()
  const t = teacher as { full_name: string; phone_number: string | null } | null

  if (t?.phone_number) {
    const verb = body.action === 'approve' ? 'approved' : 'returned for revision'
    await sendSMS(
      t.phone_number,
      `Sychar: Your ${s.subject_name} Scheme of Work (${s.class_name}, Term ${s.term}) has been ${verb}. HOD comment: ${body.comment.trim().slice(0, 120)}`
    )
  }

  return NextResponse.json({ ok: true, status: newStatus })
}

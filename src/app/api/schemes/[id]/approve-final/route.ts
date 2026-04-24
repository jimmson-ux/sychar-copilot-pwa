// PATCH /api/schemes/[id]/approve-final — principal read/acknowledge
// Principal can view any approved scheme. This is a read-only acknowledgment.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()

  const { data: scheme } = await db
    .from('schemes_of_work_new')
    .select(`
      id, subject_name, class_name, form_level, term, academic_year,
      status, hod_comment, weekly_plan, reference_books,
      created_at, updated_at,
      staff_records!teacher_id ( full_name, department )
    `)
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!scheme) return NextResponse.json({ error: 'Scheme not found' }, { status: 404 })

  return NextResponse.json({ ok: true, scheme })
}

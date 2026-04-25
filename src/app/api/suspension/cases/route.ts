// GET  /api/suspension/cases — list cases (deputy sees own; principal sees all)
// POST /api/suspension/cases — create a new case (deputy only)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['deputy', 'deputy_principal', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = svc()

  let query = db
    .from('suspension_cases')
    .select('id, status, incident_date, allegations, submitted_at, created_at, students(full_name, class_name, admission_number), staff_records!created_by(full_name)')
    .eq('school_id', auth.schoolId!)
    .order('created_at', { ascending: false })
    .limit(50)

  // Deputy sees only their own cases; principal sees all
  if (['deputy', 'deputy_principal'].includes(auth.subRole ?? '')) {
    const { data: staff } = await db
      .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
    if (staff) query = query.eq('created_by', (staff as { id: string }).id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ cases: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['deputy', 'deputy_principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: deputy only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:    string
    incident_date: string
    allegations:   string
  }

  if (!body.student_id || !body.incident_date || !body.allegations?.trim()) {
    return NextResponse.json({ error: 'student_id, incident_date, allegations required' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const { data, error } = await db
    .from('suspension_cases')
    .insert({
      school_id:     auth.schoolId,
      student_id:    body.student_id,
      created_by:    (staff as { id: string }).id,
      incident_date: body.incident_date,
      allegations:   body.allegations.trim(),
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true, case_id: (data as { id: string }).id })
}

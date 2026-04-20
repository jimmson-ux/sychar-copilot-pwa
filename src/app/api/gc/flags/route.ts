// GET  /api/gc/flags — Tier 3 support flags (all staff can see; no clinical content)
// POST /api/gc/flags — create/update a support flag (counselor, deputy, principal)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db        = svc()
  const studentId = req.nextUrl.searchParams.get('student_id')

  let query = db
    .from('student_support_flags')
    .select('id, student_id, flag_type, flag_value, set_by_role, created_at, updated_at, students(full_name, class_name)')
    .eq('school_id', auth.schoolId!)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (studentId) query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flags: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allowedRoles = ['counselor', 'deputy', 'deputy_principal', 'principal']
  if (!allowedRoles.includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:  string
    flag_type:   string   // academic_support | attendance_watch | pastoral_care | peer_support | parent_liaison | exam_concession
    flag_value?: string   // optional detail — Tier 3 safe (no clinical content)
    active?:     boolean  // false = remove flag
  }

  if (!body.student_id || !body.flag_type) {
    return NextResponse.json({ error: 'student_id and flag_type required' }, { status: 400 })
  }

  // Verify student belongs to school
  const { data: student } = await db
    .from('students')
    .select('id')
    .eq('id', body.student_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const { data, error } = await db
    .from('student_support_flags')
    .upsert({
      school_id:    auth.schoolId,
      student_id:   body.student_id,
      flag_type:    body.flag_type,
      flag_value:   body.flag_value   ?? null,
      active:       body.active       ?? true,
      set_by_role:  auth.subRole,
      set_by:       auth.userId,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'school_id,student_id,flag_type' })
    .select('id, flag_type, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, flag: data })
}

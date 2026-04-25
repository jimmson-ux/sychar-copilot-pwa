// POST /api/exeat — parent applies for exeat (no complex auth — parentId validated against DB)
// GET  /api/exeat — principal/dean lists pending requests

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const REVIEW_ROLES = new Set(['principal', 'deputy_principal', 'dean'])

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!REVIEW_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = svc()

  const { data, error } = await db
    .from('exeat_requests')
    .select(`
      id, reason, destination, leave_date, return_date,
      leave_type, status, gate_code, created_at,
      approved_at, rejection_reason,
      students!student_id ( full_name, class_name, admission_number )
    `)
    .eq('school_id', auth.schoolId!)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[exeat] GET error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    studentId:   string
    parentId:    string
    schoolCode:  string
    reason:      string
    destination: string
    leaveDate:   string
    returnDate:  string
    leaveType?:  string
  } | null

  if (!body?.studentId || !body.parentId || !body.schoolCode || !body.reason?.trim() ||
      !body.destination?.trim() || !body.leaveDate || !body.returnDate) {
    return NextResponse.json({ error: 'studentId, parentId, schoolCode, reason, destination, leaveDate, returnDate required' }, { status: 400 })
  }

  const db = svc()

  // Resolve school by short_code
  const { data: school } = await db
    .from('schools')
    .select('id')
    .eq('short_code', body.schoolCode)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })
  const schoolId = (school as { id: string }).id

  // Validate student belongs to school
  const { data: student } = await db
    .from('students')
    .select('id, full_name, class_name')
    .eq('id', body.studentId)
    .eq('school_id', schoolId)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Validate parent is linked to this student
  const { data: link } = await db
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', body.parentId)
    .eq('student_id', body.studentId)
    .maybeSingle()

  if (!link) return NextResponse.json({ error: 'Parent not linked to this student' }, { status: 403 })

  if (new Date(body.leaveDate) > new Date(body.returnDate)) {
    return NextResponse.json({ error: 'leaveDate must be before returnDate' }, { status: 400 })
  }

  const validTypes = ['day', 'overnight', 'weekend', 'holiday', 'medical', 'emergency']
  const leaveType  = validTypes.includes(body.leaveType ?? '') ? body.leaveType! : 'day'

  const { data, error } = await db
    .from('exeat_requests')
    .insert({
      school_id:   schoolId,
      student_id:  body.studentId,
      parent_id:   body.parentId,
      reason:      body.reason.trim(),
      destination: body.destination.trim(),
      leave_date:  body.leaveDate,
      return_date: body.returnDate,
      leave_type:  leaveType,
      status:      'pending',
    })
    .select('id, status, created_at')
    .single()

  if (error) {
    console.error('[exeat] POST error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Alert principal/dean
  await db.from('alerts').insert({
    school_id: schoolId,
    type:      'exeat_request',
    severity:  'low',
    title:     `Exeat request: ${(student as { full_name: string }).full_name} — ${leaveType} from ${body.leaveDate} to ${body.returnDate}`,
    detail:    { exeat_id: (data as { id: string }).id, student_id: body.studentId, reason: body.reason.trim() },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, exeatId: (data as { id: string }).id, status: 'pending' })
}

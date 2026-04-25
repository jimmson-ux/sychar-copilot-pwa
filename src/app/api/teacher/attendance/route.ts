// GET  /api/teacher/attendance?date=YYYY-MM-DD&period=N
// POST /api/teacher/attendance  — bulk submit (online) or flush from offline queue

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { userId, schoolId } = auth
  const date   = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const period = req.nextUrl.searchParams.get('period')

  const { data: staff } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', userId!)
    .eq('school_id', schoolId!)
    .single()

  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  let query = db
    .from('attendance_records')
    .select('id, class_name, subject, date, period, student_id, student_name, status, reason, synced_at')
    .eq('school_id', schoolId!)
    .eq('teacher_id', staff.id as string)
    .eq('date', date)
    .order('period')

  if (period) query = query.eq('period', Number(period))

  const { data } = await query
  return NextResponse.json({ records: data ?? [] })
}

interface AttendanceEntry {
  student_id?:   string
  student_name:  string
  status:        'present' | 'absent' | 'late' | 'excused'
  reason?:       string
}

interface AttendanceBatch {
  class_name: string
  subject?:   string
  date:       string
  period:     number
  lat?:       number
  lng?:       number
  entries:    AttendanceEntry[]
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const { userId, schoolId } = auth

  const { data: staff } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', userId!)
    .eq('school_id', schoolId!)
    .single()

  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const body = await req.json() as { batches?: AttendanceBatch[]; batch?: AttendanceBatch }

  // Accept single batch or array of batches (offline flush sends array)
  const batches: AttendanceBatch[] = body.batches ?? (body.batch ? [body.batch] : [])

  if (batches.length === 0) {
    return NextResponse.json({ error: 'No batches provided' }, { status: 400 })
  }

  const rows: Record<string, unknown>[] = []
  for (const b of batches) {
    for (const e of (b.entries ?? [])) {
      rows.push({
        school_id:    schoolId,
        teacher_id:   staff.id,
        class_name:   b.class_name,
        subject:      b.subject ?? null,
        date:         b.date,
        period:       b.period,
        student_id:   e.student_id ?? null,
        student_name: e.student_name,
        status:       e.status,
        reason:       e.reason ?? null,
        lat:          b.lat ?? null,
        lng:          b.lng ?? null,
        synced_at:    new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) return NextResponse.json({ saved: 0 })

  const { error } = await db.from('attendance_records').insert(rows)
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ saved: rows.length })
}

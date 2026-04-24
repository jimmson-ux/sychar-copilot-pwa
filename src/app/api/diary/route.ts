// GET  /api/diary?date=YYYY-MM-DD — fetch (or auto-compile) diary for a date
// POST /api/diary — create or update a draft diary entry (principal only)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const db   = svc()

  const { data, error } = await db
    .from('school_daily_diary')
    .select('*')
    .eq('school_id', auth.schoolId!)
    .eq('diary_date', date)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (data) {
    return NextResponse.json({ diary: data, date })
  }

  // Auto-compile from the day's operational data
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const nextDayStr = nextDay.toISOString().split('T')[0]

  const [todRes, attendanceRes, disciplineRes, clinicRes, noticesRes] = await Promise.all([
    db.from('teacher_on_duty')
      .select('duty_date, report, staff_records(full_name)')
      .eq('school_id', auth.schoolId!)
      .eq('duty_date', date)
      .limit(5),

    db.from('attendance_records')
      .select('status')
      .eq('school_id', auth.schoolId!)
      .eq('date', date),

    db.from('discipline_records')
      .select('incident_type, severity, resolution_status')
      .eq('school_id', auth.schoolId!)
      .eq('date', date),

    db.from('health_visits')
      .select('complaint, action_taken')
      .eq('school_id', auth.schoolId!)
      .gte('visited_at', date)
      .lt('visited_at', nextDayStr)
      .limit(20),

    db.from('notices')
      .select('title, content, target_audience')
      .eq('school_id', auth.schoolId!)
      .gte('created_at', date)
      .lt('created_at', nextDayStr)
      .limit(10),
  ])

  type AttRow = { status: string }
  const att        = (attendanceRes.data ?? []) as AttRow[]
  const attTotal   = att.length
  const attPresent = att.filter(a => a.status === 'present').length

  const compiled = {
    tod_reports:          todRes.data ?? [],
    attendance:           { total: attTotal, present: attPresent, absent: attTotal - attPresent,
                            rate: attTotal > 0 ? Math.round(attPresent / attTotal * 100) : null },
    discipline_incidents: disciplineRes.data ?? [],
    clinic_visits:        clinicRes.data ?? [],
    notices:              noticesRes.data ?? [],
  }

  return NextResponse.json({ diary: null, compiled, date })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    date?:    string
    content:  Record<string, unknown>
  } | null

  if (!body?.content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  const date = body.date ?? new Date().toISOString().split('T')[0]
  const db   = svc()

  // Guard: sealed diary cannot be overwritten
  const { data: existing } = await db
    .from('school_daily_diary')
    .select('id, sealed')
    .eq('school_id', auth.schoolId!)
    .eq('diary_date', date)
    .single()

  if (existing && (existing as { sealed: boolean }).sealed) {
    return NextResponse.json({ error: 'Diary is sealed — cannot edit' }, { status: 409 })
  }

  const { data, error } = await db
    .from('school_daily_diary')
    .upsert({
      school_id:  auth.schoolId,
      diary_date: date,
      content:    body.content,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'school_id,diary_date' })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

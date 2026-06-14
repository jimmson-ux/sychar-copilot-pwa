// GET /api/biometric/report?date=YYYY-MM-DD — daily biometric attendance report.
// Arrivals / departures / unauthorised-exit counts + first-arrival & last-departure per
// student from the movement timeline. Leadership + boarding. Feature: biometric_gate.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { tenantHasFeature } from '@/lib/tenantFeature'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const VIEW_ROLES = new Set([
  'principal', 'deputy_principal', 'deputy_principal_admin', 'deputy_principal_academic',
  'dean', 'boarding_master', 'boarding_mistress', 'security', 'teacher_on_duty', 'tod',
])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!VIEW_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!await tenantHasFeature(auth.schoolId!, 'biometric_gate')) {
    return NextResponse.json({ error: 'biometric_gate feature not enabled' }, { status: 403 })
  }

  const db = svc()
  const schoolId = auth.schoolId!
  const date = new URL(req.url).searchParams.get('date')
    ?? new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })).toISOString().slice(0, 10)

  const { data: moves } = await db.from('student_movements')
    .select('student_id, movement_type, event_at, students!inner(full_name, class_name)')
    .eq('school_id', schoolId)
    .gte('event_at', `${date}T00:00:00Z`).lt('event_at', `${date}T23:59:59Z`)
    .order('event_at', { ascending: true }).limit(5000)

  const rows = (moves ?? []) as any[]
  const byType: Record<string, number> = {}
  const perStudent = new Map<string, { name: string; class_name: string; first_in?: string; last_out?: string; unauthorized: boolean }>()

  for (const m of rows) {
    byType[m.movement_type] = (byType[m.movement_type] ?? 0) + 1
    const stu = m.students
    const cur = perStudent.get(m.student_id)
      ?? { name: (stu?.full_name ?? '—') as string, class_name: (stu?.class_name ?? '—') as string, first_in: undefined as string | undefined, last_out: undefined as string | undefined, unauthorized: false }
    if (/ARRIVAL|RETURN/.test(m.movement_type) && !cur.first_in) cur.first_in = m.event_at
    if (m.movement_type === 'DEPARTURE' || m.movement_type === 'UNAUTHORIZED_EXIT_ATTEMPT') cur.last_out = m.event_at
    if (m.movement_type === 'UNAUTHORIZED_EXIT_ATTEMPT') cur.unauthorized = true
    perStudent.set(m.student_id, cur)
  }

  return NextResponse.json({
    ok: true, date, total_movements: rows.length,
    by_type: byType,
    arrivals: (byType['ARRIVAL'] ?? 0) + (byType['RETURN_FROM_EXEAT'] ?? 0) + (byType['RETURN_FROM_LEAVE'] ?? 0) + (byType['RETURN_FROM_HOSPITAL'] ?? 0),
    departures: byType['DEPARTURE'] ?? 0,
    unauthorized_exits: byType['UNAUTHORIZED_EXIT_ATTEMPT'] ?? 0,
    students: [...perStudent.entries()].map(([student_id, v]) => ({ student_id, ...v })),
  })
}

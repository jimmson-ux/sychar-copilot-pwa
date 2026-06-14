// GET /api/roll-call — emergency roll-call snapshot (Oloolaiser + biometric schools).
// Returns presence counts + the unaccounted-for list (OFF_CAMPUS / UNKNOWN with no open exeat)
// so leadership can account for every student in seconds during a fire drill / emergency.
// Gated: leadership + boarding masters. Feature: biometric_gate.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { tenantHasFeature } from '@/lib/tenantFeature'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ROLL_ROLES = new Set([
  'principal', 'deputy_principal', 'deputy_principal_admin', 'deputy_principal_academic',
  'dean', 'boarding_master', 'boarding_mistress', 'security', 'teacher_on_duty', 'tod',
])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ROLL_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!await tenantHasFeature(auth.schoolId!, 'biometric_gate')) {
    return NextResponse.json({ error: 'biometric_gate feature not enabled for this school' }, { status: 403 })
  }

  const db = svc()
  const schoolId = auth.schoolId!

  // 1) Counts per status (one grouped RPC).
  const { data: summary } = await db.rpc('presence_summary', { p_school_id: schoolId })
  const counts: Record<string, number> = {}
  for (const r of (summary ?? []) as { current_status: string; n: number }[]) counts[r.current_status] = r.n

  // 2) Total active students (anyone with no presence row = UNKNOWN/unaccounted).
  const { count: totalActive } = await db.from('students')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId).eq('is_active', true)

  // 3) The unaccounted-for list: OFF_CAMPUS / UNKNOWN with NO open approved exeat.
  const { data: presRows } = await db.from('student_presence')
    .select('student_id, current_status, last_seen_at, last_event, students!inner(full_name, class_name, admission_no)')
    .eq('school_id', schoolId).in('current_status', ['OFF_CAMPUS', 'UNKNOWN'])
    .order('last_seen_at', { ascending: true }).limit(1000)

  const offIds = (presRows ?? []).map((r: { student_id: string }) => r.student_id)
  const excused = new Set<string>()
  if (offIds.length) {
    const { data: ex } = await db.from('exeat_requests')
      .select('student_id').eq('school_id', schoolId).eq('status', 'approved').is('return_time', null).in('student_id', offIds)
    for (const e of (ex ?? []) as { student_id: string }[]) excused.add(e.student_id)
  }

  const unaccounted = (presRows ?? [])
    .filter((r: { student_id: string }) => !excused.has(r.student_id))
    .map((r: any) => ({
      student_id: r.student_id,
      name: r.students?.full_name ?? '—',
      class_name: r.students?.class_name ?? '—',
      admission_no: r.students?.admission_no ?? null,
      status: r.current_status,
      last_seen_at: r.last_seen_at,
      last_event: r.last_event,
    }))

  const onCampus = counts['ON_CAMPUS'] ?? 0
  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    total_active: totalActive ?? 0,
    counts,
    on_campus: onCampus,
    off_campus: counts['OFF_CAMPUS'] ?? 0,
    on_exeat: (counts['ON_EXEAT'] ?? 0) + (counts['ON_LEAVE'] ?? 0) + (counts['HOSPITAL'] ?? 0),
    unaccounted_count: unaccounted.length,
    unaccounted,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gate/live-scans?minutes=10
 *
 * Real-time fingerprint countercheck for the gatekeeper: the latest biometric
 * (ZKTeco / attendance_events) student scans, resolved to name + photo + class +
 * direction, so the guard sees on-screen confirmation that a fingerprint "hit".
 *
 * Per-school isolated (attendance_events.school_id). Read-only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const url = new URL(req.url)
  const minutes = Math.min(60, Math.max(1, Number(url.searchParams.get('minutes')) || 10))
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString()

  const svc = createAdminSupabaseClient()

  const { data: events, error } = await svc
    .from('attendance_events')
    .select('id, student_id, staff_id, subject_type, direction, event_at')
    .eq('school_id', auth.schoolId)
    .gte('event_at', since)
    .order('event_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[gate/live-scans]', error)
    return NextResponse.json({ error: 'Failed to load scans' }, { status: 500 })
  }

  type Ev = { id: string; student_id: string | null; staff_id: string | null; subject_type: string; direction: string; event_at: string }
  const rows = (events as Ev[] ?? [])

  // Resolve student names/photos in one query.
  const studentIds = [...new Set(rows.filter((e) => e.student_id).map((e) => e.student_id as string))]
  const studentInfo = new Map<string, { full_name: string; class_name: string | null; photo_url: string | null; admission_number: string | null }>()
  if (studentIds.length) {
    const { data: studs } = await svc
      .from('students')
      .select('id, full_name, class_name, photo_url, admission_number')
      .in('id', studentIds)
    for (const s of (studs as any[] ?? [])) {
      studentInfo.set(s.id, { full_name: s.full_name, class_name: s.class_name, photo_url: s.photo_url, admission_number: s.admission_number })
    }
  }

  const scans = rows.map((e) => ({
    id: e.id,
    subject_type: e.subject_type,
    direction: e.direction,
    event_at: e.event_at,
    student: e.student_id ? (studentInfo.get(e.student_id) ?? null) : null,
  }))

  return NextResponse.json({ scans, count: scans.length, window_minutes: minutes })
}

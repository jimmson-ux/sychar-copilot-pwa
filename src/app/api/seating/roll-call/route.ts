// GET /api/seating/roll-call?class=Form+3+East&stream=East&term=2&year=2025/2026
// Returns the seat map grid with full student info for roll call / display.
// Read-only — all roles can access their school's seating data.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sp         = req.nextUrl.searchParams
  const className  = sp.get('class')
  const streamName = sp.get('stream')
  const term       = sp.get('term')
  const year       = sp.get('year') ?? '2025/2026'

  if (!className) {
    return NextResponse.json({ error: 'class parameter required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // Find the active seat map
  let mapQuery = db
    .from('classroom_seat_maps')
    .select('id, class_name, stream_name, rows, cols, term, academic_year, teacher_desk_position')
    .eq('school_id', auth.schoolId)
    .eq('class_name', className)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (streamName) mapQuery = mapQuery.eq('stream_name', streamName)
  if (term)       mapQuery = mapQuery.eq('term', parseInt(term))

  const { data: maps } = await mapQuery
  const seatMap = maps?.[0]

  if (!seatMap) {
    return NextResponse.json({ error: 'No seat map found for this class' }, { status: 404 })
  }

  // Load all seat assignments with student info
  const { data: assignments } = await db
    .from('student_seat_assignments')
    .select(`
      id, student_id, row_number, col_number, seat_label,
      is_discipline_risk, is_high_performer, is_low_performer,
      adjacent_risk_score, is_active, placement_note
    `)
    .eq('seat_map_id', seatMap.id)
    .eq('is_active', true)
    .order('row_number')
    .order('col_number')

  const studentIds = (assignments ?? []).map((a: { student_id: string }) => a.student_id)

  // Load student profiles in one query
  const { data: studentsData } = studentIds.length > 0
    ? await db
        .from('students')
        .select('id, full_name, gender, admission_number, admission_no, photo_url')
        .in('id', studentIds)
    : { data: [] }

  const studentMap = Object.fromEntries(
    (studentsData ?? []).map((s: {
      id: string; full_name: string; gender: string | null
      admission_number: string | null; admission_no: string | null; photo_url: string | null
    }) => [s.id, s])
  )

  // Enrich assignments with student data
  const seats = (assignments ?? []).map((a: {
    id: string; student_id: string; row_number: number; col_number: number
    seat_label: string | null; is_discipline_risk: boolean; is_high_performer: boolean
    is_low_performer: boolean; adjacent_risk_score: number; is_active: boolean
    placement_note: string | null
  }) => {
    const stu = studentMap[a.student_id] as {
      full_name: string; gender: string | null
      admission_number: string | null; admission_no: string | null; photo_url: string | null
    } | undefined
    return {
      ...a,
      student_name:     stu?.full_name ?? null,
      student_gender:   stu?.gender ?? null,
      admission_number: stu?.admission_number ?? stu?.admission_no ?? null,
      photo_url:        stu?.photo_url ?? null,
    }
  })

  // Load latest seating intelligence (if computed)
  const { data: intelligence } = await db
    .from('seating_intelligence')
    .select('risk_count, urgent_move_count, class_summary, computed_at')
    .eq('seat_map_id', seatMap.id)
    .maybeSingle()

  return NextResponse.json({
    seat_map:   seatMap,
    seats,
    intelligence: intelligence ?? null,
    total_seats:  (seatMap.rows as number) * (seatMap.cols as number),
    seats_occupied: seats.length,
    seats_empty:    (seatMap.rows as number) * (seatMap.cols as number) - seats.length,
  })
}

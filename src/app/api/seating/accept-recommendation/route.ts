// POST /api/seating/accept-recommendation
// Teacher applies a specific AI-suggested move.
// Sets reason_code = 'ai_suggestion' so we can track AI adoption rate.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set([
  'principal','deputy_principal','deputy_principal_admin',
  'class_teacher','bom_teacher','form_principal',
  'dean_of_studies','deputy_dean',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ALLOWED.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    seatMapId?: string
    recommendedMove?: {
      student_id?: string
      student_name?: string
      from_row?: number
      from_col?: number
      to_row?: number
      to_col?: number
      reason?: string
    }
  }

  if (!body.seatMapId || !body.recommendedMove?.student_id) {
    return NextResponse.json({ error: 'seatMapId and recommendedMove.student_id required' }, { status: 400 })
  }

  const move = body.recommendedMove
  if (move.to_row == null || move.to_col == null) {
    return NextResponse.json({ error: 'recommendedMove.to_row and to_col required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // Verify seat map belongs to this school
  const { data: seatMap } = await db
    .from('classroom_seat_maps')
    .select('id, school_id')
    .eq('id', body.seatMapId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!seatMap) {
    return NextResponse.json({ error: 'Seat map not found' }, { status: 404 })
  }

  const { data: staffRow } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  const staffId = staffRow?.id ?? null

  // Check if target seat is occupied (handle swap)
  const { data: occupant } = await db
    .from('student_seat_assignments')
    .select('id, student_id, row_number, col_number')
    .eq('seat_map_id', body.seatMapId)
    .eq('row_number', move.to_row)
    .eq('col_number', move.to_col)
    .eq('is_active', true)
    .maybeSingle()

  const isSwap = occupant && occupant.student_id !== move.student_id

  if (isSwap) {
    await Promise.all([
      db.from('student_seat_assignments')
        .update({
          row_number: move.from_row ?? move.to_row,
          col_number: move.from_col ?? move.to_col,
          seat_label: 'R' + (move.from_row ?? move.to_row) + 'C' + (move.from_col ?? move.to_col),
          placed_by:  staffId,
          placed_at:  new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', occupant.id),
      db.from('student_seat_assignments')
        .update({
          row_number: move.to_row,
          col_number: move.to_col,
          seat_label: 'R' + move.to_row + 'C' + move.to_col,
          placed_by:  staffId,
          placed_at:  new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('seat_map_id', body.seatMapId)
        .eq('student_id', move.student_id),
    ])

    await db.from('seat_change_log').insert([
      {
        school_id:   auth.schoolId,
        seat_map_id: body.seatMapId,
        student_id:  move.student_id,
        from_row:    move.from_row ?? null,
        from_col:    move.from_col ?? null,
        to_row:      move.to_row,
        to_col:      move.to_col,
        reason:      move.reason ?? 'AI suggestion accepted',
        reason_code: 'ai_suggestion',
        moved_by:    staffId,
      },
      {
        school_id:   auth.schoolId,
        seat_map_id: body.seatMapId,
        student_id:  occupant.student_id,
        from_row:    occupant.row_number,
        from_col:    occupant.col_number,
        to_row:      move.from_row ?? move.to_row,
        to_col:      move.from_col ?? move.to_col,
        reason:      'Seat swap — AI suggestion accepted',
        reason_code: 'ai_suggestion',
        moved_by:    staffId,
      },
    ])
  } else {
    await db.from('student_seat_assignments')
      .update({
        row_number: move.to_row,
        col_number: move.to_col,
        seat_label: 'R' + move.to_row + 'C' + move.to_col,
        placed_by:  staffId,
        placed_at:  new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('seat_map_id', body.seatMapId)
      .eq('student_id', move.student_id)

    await db.from('seat_change_log').insert({
      school_id:   auth.schoolId,
      seat_map_id: body.seatMapId,
      student_id:  move.student_id,
      from_row:    move.from_row ?? null,
      from_col:    move.from_col ?? null,
      to_row:      move.to_row,
      to_col:      move.to_col,
      reason:      move.reason ?? 'AI suggestion accepted',
      reason_code: 'ai_suggestion',
      moved_by:    staffId,
    })
  }

  return NextResponse.json({
    success: true,
    is_swap: isSwap,
    applied: {
      student_id:   move.student_id,
      student_name: move.student_name,
      from_row:     move.from_row,
      from_col:     move.from_col,
      to_row:       move.to_row,
      to_col:       move.to_col,
    },
  })
}

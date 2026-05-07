// POST /api/seating/move
// Persists a drag-and-drop seat move or swap.
// Handles both simple moves (to empty seat) and swaps (two students exchange seats).
// Logs every change to seat_change_log for the immutable audit trail.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const MOVE_ROLES = new Set([
  'principal','deputy_principal','deputy_principal_admin',
  'class_teacher','bom_teacher','form_principal',
  'dean_of_studies','deputy_dean',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!MOVE_ROLES.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden — class teacher or above required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    seatMapId?:   string
    studentId?:   string
    fromRow?:     number
    fromCol?:     number
    toRow?:       number
    toCol?:       number
    reasonCode?:  string
    note?:        string
  }

  const { seatMapId, studentId, fromRow, fromCol, toRow, toCol } = body
  if (!seatMapId || !studentId || toRow == null || toCol == null) {
    return NextResponse.json({ error: 'seatMapId, studentId, toRow, toCol required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // Verify the seat map belongs to caller's school
  const { data: seatMap } = await db
    .from('classroom_seat_maps')
    .select('id, class_name, stream_name, school_id')
    .eq('id', seatMapId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!seatMap) {
    return NextResponse.json({ error: 'Seat map not found' }, { status: 404 })
  }

  // Resolve caller's staff record (needed for moved_by / placed_by)
  const { data: staffRow } = await db
    .from('staff_records')
    .select('id, assigned_class')
    .eq('user_id', auth.userId)
    .single()

  const staffId = staffRow?.id ?? null

  // Check if the target seat is occupied by someone else
  const { data: occupant } = await db
    .from('student_seat_assignments')
    .select('id, student_id, row_number, col_number')
    .eq('seat_map_id', seatMapId)
    .eq('row_number', toRow)
    .eq('col_number', toCol)
    .eq('is_active', true)
    .maybeSingle()

  const isSwap = occupant && occupant.student_id !== studentId

  if (isSwap) {
    // SWAP: move the occupant to the vacated seat, then move our student to the target
    const [r1, r2] = await Promise.all([
      db.from('student_seat_assignments')
        .update({
          row_number: fromRow ?? toRow,
          col_number: fromCol ?? toCol,
          seat_label: 'R' + (fromRow ?? toRow) + 'C' + (fromCol ?? toCol),
          placed_by:  staffId,
          placed_at:  new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', occupant.id),
      db.from('student_seat_assignments')
        .update({
          row_number: toRow,
          col_number: toCol,
          seat_label: 'R' + toRow + 'C' + toCol,
          placed_by:  staffId,
          placed_at:  new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('seat_map_id', seatMapId)
        .eq('student_id', studentId),
    ])

    if (r1.error || r2.error) {
      return NextResponse.json({ error: 'Swap failed' }, { status: 500 })
    }

    // Log both sides of the swap
    await db.from('seat_change_log').insert([
      {
        school_id:   auth.schoolId,
        seat_map_id: seatMapId,
        student_id:  studentId,
        from_row:    fromRow ?? null,
        from_col:    fromCol ?? null,
        to_row:      toRow,
        to_col:      toCol,
        reason:      body.note ?? null,
        reason_code: body.reasonCode ?? 'teacher_preference',
        moved_by:    staffId,
      },
      {
        school_id:   auth.schoolId,
        seat_map_id: seatMapId,
        student_id:  occupant.student_id,
        from_row:    occupant.row_number,
        from_col:    occupant.col_number,
        to_row:      fromRow ?? toRow,
        to_col:      fromCol ?? toCol,
        reason:      'Seat swap',
        reason_code: body.reasonCode ?? 'teacher_preference',
        moved_by:    staffId,
      },
    ])
  } else {
    // SIMPLE MOVE to an empty seat
    const { error } = await db
      .from('student_seat_assignments')
      .update({
        row_number: toRow,
        col_number: toCol,
        seat_label: 'R' + toRow + 'C' + toCol,
        placed_by:  staffId,
        placed_at:  new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('seat_map_id', seatMapId)
      .eq('student_id', studentId)

    if (error) {
      return NextResponse.json({ error: 'Move failed: ' + error.message }, { status: 500 })
    }

    await db.from('seat_change_log').insert({
      school_id:   auth.schoolId,
      seat_map_id: seatMapId,
      student_id:  studentId,
      from_row:    fromRow ?? null,
      from_col:    fromCol ?? null,
      to_row:      toRow,
      to_col:      toCol,
      reason:      body.note ?? null,
      reason_code: body.reasonCode ?? 'teacher_preference',
      moved_by:    staffId,
    })
  }

  return NextResponse.json({
    success: true,
    is_swap: isSwap,
    moved:   { studentId, fromRow, fromCol, toRow, toCol },
    message: isSwap
      ? 'Students swapped. Intelligence will refresh on next analysis.'
      : 'Seat updated. Intelligence will refresh on next analysis.',
  })
}

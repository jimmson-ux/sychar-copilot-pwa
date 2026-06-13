// POST /api/seating/analyze
// Loads full seating picture for a class, calls Claude for intelligence analysis,
// saves results to seating_intelligence, and refreshes principal_seating_summary.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { askAIProvider } from '@/lib/aiProvider'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { updatePrincipalSeatingSummary } from '@/lib/seating-summary'

const ALLOWED = new Set([
  'principal','deputy_principal','deputy_principal_admin',
  'class_teacher','bom_teacher','form_principal',
  'dean_of_studies','deputy_dean','hod','qaso',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ALLOWED.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden — class teacher or leadership required' }, { status: 403 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as {
    seatMapId?: string
    forceRefresh?: boolean
  }

  if (!body.seatMapId) {
    return NextResponse.json({ error: 'seatMapId required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // ── Step 1: Load seat map with all assignments ─────────────
  const { data: seatMap, error: mapErr } = await db
    .from('classroom_seat_maps')
    .select(`
      id, class_name, stream_name, rows, cols,
      term, academic_year, teacher_desk_position,
      student_seat_assignments (
        id, student_id, row_number, col_number, seat_label,
        is_discipline_risk, is_high_performer, is_low_performer,
        adjacent_risk_score, is_active
      )
    `)
    .eq('id', body.seatMapId)
    .eq('school_id', auth.schoolId)
    .single()

  if (mapErr || !seatMap) {
    return NextResponse.json({ error: 'Seat map not found' }, { status: 404 })
  }

  type SeatAssignment = {
    id: string; student_id: string; row_number: number; col_number: number
    seat_label: string | null; is_discipline_risk: boolean; is_high_performer: boolean
    is_low_performer: boolean; adjacent_risk_score: number; is_active: boolean
  }

  const assignments = ((seatMap.student_seat_assignments ?? []) as SeatAssignment[])
    .filter(s => s.is_active)

  if (assignments.length < 3) {
    return NextResponse.json({ error: 'Not enough seated students for analysis (minimum 3)' }, { status: 400 })
  }

  const studentIds = assignments.map(s => s.student_id)

  // ── Step 2: Load student profiles ─────────────────────────
  const { data: studentsData } = await db
    .from('students')
    .select('id, full_name, gender')
    .in('id', studentIds)

  const studentMap = Object.fromEntries(
    (studentsData ?? []).map((s: { id: string; full_name: string; gender: string | null }) =>
      [s.id, { name: s.full_name, gender: s.gender }]
    )
  )

  // ── Step 3: Load discipline records (last 90 days) ─────────
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: discipline } = await db
    .from('discipline_records')
    .select('student_id, offence, tone, created_at')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const disciplineByStudent: Record<string, Array<{ offence: string | null; tone: string | null; days_ago: number }>> = {}
  for (const d of (discipline ?? []) as Array<{ student_id: string; offence: string | null; tone: string | null; created_at: string }>) {
    if (!disciplineByStudent[d.student_id]) disciplineByStudent[d.student_id] = []
    disciplineByStudent[d.student_id].push({
      offence:  d.offence,
      tone:     d.tone,
      days_ago: Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86_400_000),
    })
  }

  // ── Step 4: Load marks for this term ──────────────────────
  const { data: marksData } = await db
    .from('marks')
    .select('student_id, percentage')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)
    .eq('term', String(seatMap.term))
    .eq('academic_year', seatMap.academic_year)
    .not('percentage', 'is', null)

  const scoresByStudent: Record<string, number[]> = {}
  for (const m of (marksData ?? []) as Array<{ student_id: string; percentage: number }>) {
    if (!scoresByStudent[m.student_id]) scoresByStudent[m.student_id] = []
    scoresByStudent[m.student_id].push(m.percentage)
  }

  const avgByStudent: Record<string, number | null> = {}
  for (const sid of studentIds) {
    const scores = scoresByStudent[sid]
    avgByStudent[sid] = scores?.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null
  }

  const validScores = Object.values(avgByStudent).filter((v): v is number => v !== null)
  const classAverage = validScores.length
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : 50

  // ── Step 5: Build structured seating picture for Claude ───
  const seatingPicture = assignments.map(seat => {
    const student = studentMap[seat.student_id] ?? { name: 'Unknown', gender: null }
    const discRecords = disciplineByStudent[seat.student_id] ?? []
    const avgScore = avgByStudent[seat.student_id]

    return {
      seat:                 `Row ${seat.row_number}, Col ${seat.col_number}`,
      row:                  seat.row_number,
      col:                  seat.col_number,
      student_id:           seat.student_id,
      name:                 student.name,
      gender:               student.gender,
      avg_score:            avgScore,
      score_vs_class:       avgScore !== null ? avgScore - classAverage : null,
      discipline_incidents: discRecords.length,
      recent_offences:      discRecords.slice(0, 3),
      is_discipline_risk:   seat.is_discipline_risk,
      is_high_performer:    seat.is_high_performer,
      is_low_performer:     seat.is_low_performer,
      adjacent_risk_score:  seat.adjacent_risk_score,
    }
  })

  // ── Step 6: Call Claude ────────────────────────────────────
  const prompt = `You are analysing the seating arrangement for a Kenyan secondary school class.
School: Nkoroi Mixed Day Senior Secondary School
Class: ${seatMap.class_name} ${seatMap.stream_name}
Term: ${seatMap.term}, ${seatMap.academic_year}
Class size: ${seatingPicture.length} students
Class average score: ${classAverage}%
Classroom: ${seatMap.rows} rows × ${seatMap.cols} columns
Row 1 = FRONT (near teacher desk). Row ${seatMap.rows} = BACK.

COMPLETE SEATING PICTURE:
${JSON.stringify(seatingPicture, null, 2)}

ANALYSE AND RETURN ONLY VALID JSON — no text outside the JSON block:
{
  "discipline_clusters": [
    {
      "students": [{"name":"","seat":"Row X, Col Y","incidents":0}],
      "cluster_risk": "high",
      "reason": "specific explanation referencing real student names and incident history",
      "recommendation": "specific action e.g. Move [Name] to Row 1 Col 2 to separate from [Name]"
    }
  ],
  "performance_gaps": [
    {
      "low_performer": {"name":"","seat":"","avg_score":0},
      "nearest_high_performer": {"name":"","seat":"","avg_score":0},
      "distance_seats": 0,
      "recommendation": "specific seat swap recommendation"
    }
  ],
  "recommended_moves": [
    {
      "student_name": "",
      "student_id": "",
      "from_row": 0,
      "from_col": 0,
      "to_row": 0,
      "to_col": 0,
      "reason": "specific reason using actual data",
      "priority": "urgent",
      "expected_outcome": "what improvement is expected"
    }
  ],
  "class_summary": "One paragraph for the class teacher. Use real student names. Be direct and specific.",
  "principal_summary": "One sentence for the principal. Example: 'Form 3 East has 2 high-risk clusters and 3 recommended moves pending teacher action.'",
  "risk_count": 0,
  "urgent_move_count": 0
}

RULES:
- Only recommend moves to EMPTY seats or swaps between students
- Never place two discipline-risk students adjacent in a recommendation
- High performers in back rows should move forward for peer influence on neighbours
- Discipline-risk students belong in front rows (teacher visibility)
- Use REAL student names from the data — no placeholders
- If no issues found, say so clearly in the summary
- Limit recommended_moves to maximum 5 (most impactful only)`

  let analysis: Record<string, unknown>

  try {
    const ai = await askAIProvider('You are a classroom seating-optimisation assistant for a Kenyan secondary school.', [{ role: 'user', content: prompt }], 2000)
    const raw = ai.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    analysis = JSON.parse(match[0])
  } catch (e) {
    console.error('[seating/analyze] AI error:', e)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 })
  }

  // ── Step 7: Save to seating_intelligence ──────────────────
  await db.from('seating_intelligence').upsert({
    school_id:               auth.schoolId,
    seat_map_id:             body.seatMapId,
    class_name:              seatMap.class_name,
    stream_name:             seatMap.stream_name,
    term:                    seatMap.term,
    academic_year:           seatMap.academic_year,
    discipline_clusters:     analysis.discipline_clusters ?? [],
    performance_gaps:        analysis.performance_gaps ?? [],
    recommended_moves:       analysis.recommended_moves ?? [],
    class_summary:           analysis.class_summary ?? null,
    principal_summary:       analysis.principal_summary ?? null,
    risk_count:              (analysis.risk_count as number) ?? 0,
    urgent_move_count:       (analysis.urgent_move_count as number) ?? 0,
    computed_at:             new Date().toISOString(),
    discipline_records_count: (discipline ?? []).length,
    marks_records_count:     (marksData ?? []).length,
  }, { onConflict: 'school_id,seat_map_id' })

  // ── Step 8: Refresh principal dashboard summary ────────────
  await updatePrincipalSeatingSummary(
    auth.schoolId,
    seatMap.term as number,
    seatMap.academic_year as string
  ).catch(err => console.error('[seating/analyze] summary update error:', err))

  return NextResponse.json({
    analysis,
    seat_map: {
      id:          seatMap.id,
      class_name:  seatMap.class_name,
      stream_name: seatMap.stream_name,
      rows:        seatMap.rows,
      cols:        seatMap.cols,
    },
    students_analysed: seatingPicture.length,
    class_average:     classAverage,
    computed_at:       new Date().toISOString(),
  })
}

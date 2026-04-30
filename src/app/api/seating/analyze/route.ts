// POST /api/seating/analyze — Claude seating intelligence analysis

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const ALLOWED = new Set([
  'principal','deputy_principal','deputy_principal_academic',
  'class_teacher','dean_of_studies','dean_of_students',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — class teacher or above required' }, { status: 403 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as {
    class_name?: string
    stream_name?: string
    term?: number
    academic_year?: string
  }

  if (!body.class_name || !body.academic_year) {
    return NextResponse.json({ error: 'class_name and academic_year required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  // Fetch seating layout
  let seatQuery = db
    .from('seating_arrangements')
    .select('id, layout')
    .eq('school_id', auth.schoolId)
    .eq('class_name', body.class_name)
    .eq('academic_year', body.academic_year)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (body.stream_name) seatQuery = seatQuery.eq('stream_name', body.stream_name)
  if (body.term)        seatQuery = seatQuery.eq('term', body.term)

  const { data: seatData } = await seatQuery
  const arrangement = seatData?.[0]
  if (!arrangement?.layout) {
    return NextResponse.json({ error: 'No seating layout found for this class' }, { status: 404 })
  }

  // Extract student IDs from layout
  const layout = arrangement.layout as Array<{ row: number; col: number; student_id: string; student_name?: string }>
  const studentIds = layout.map(s => s.student_id).filter(Boolean)

  // Fetch discipline records (last 90 days)
  const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
  const { data: discipline } = await db
    .from('discipline_records')
    .select('student_id, category, severity, incident_date, description')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)
    .gte('incident_date', since)
    .order('incident_date', { ascending: false })

  // Fetch latest marks
  const { data: marks } = await db
    .from('marks')
    .select('student_id, raw_score, total_marks, grade, subject_id')
    .in('student_id', studentIds)
    .order('recorded_at', { ascending: false })
    .limit(studentIds.length * 5)

  // Fetch student names
  const { data: students } = await db
    .from('students')
    .select('id, full_name')
    .in('id', studentIds)

  const nameMap = Object.fromEntries((students ?? []).map((s: { id: string; full_name: string }) => [s.id, s.full_name]))

  // Build seating grid representation
  const seatingGrid = layout.map(seat => ({
    row:     seat.row,
    col:     seat.col,
    student: nameMap[seat.student_id] ?? `Student ${seat.student_id.slice(0, 6)}`,
    id:      seat.student_id,
  }))

  // Aggregate discipline per student
  const discMap: Record<string, number> = {}
  for (const d of (discipline ?? [])) {
    discMap[d.student_id] = (discMap[d.student_id] ?? 0) + 1
  }

  // Average score per student
  const scoreMap: Record<string, number[]> = {}
  for (const m of (marks ?? [])) {
    if (!scoreMap[m.student_id]) scoreMap[m.student_id] = []
    if (m.raw_score != null && m.total_marks > 0) {
      scoreMap[m.student_id].push(Math.round((m.raw_score / m.total_marks) * 100))
    }
  }
  const avgMap: Record<string, number> = {}
  for (const [sid, scores] of Object.entries(scoreMap)) {
    avgMap[sid] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  const enrichedGrid = seatingGrid.map(seat => ({
    ...seat,
    discipline_incidents: discMap[seat.id] ?? 0,
    avg_score:            avgMap[seat.id] ?? null,
  }))

  const prompt = `You are analyzing a seating arrangement for a Kenyan secondary school class.

CLASS: ${body.class_name}${body.stream_name ? ' ' + body.stream_name : ''}

SEATING GRID (row, col, student name, discipline incidents last 90 days, average score %):
${JSON.stringify(enrichedGrid, null, 2)}

Analyze this seating arrangement and provide actionable intelligence:

1. DISRUPTION CLUSTERS: Which seat adjacencies are likely causing discipline issues?
   Identify specific students by name and seat position.

2. PERFORMANCE PAIRS: Which students should sit together for peer learning?
   Match high performers (>70%) with struggling students (<50%).

3. STRATEGIC RELOCATIONS: Top 5 specific seat changes with reasons.
   Format: "Move [StudentName] from [Row X, Col Y] to [Row A, Col B] because..."

4. ZONE PATTERNS: Any patterns between seating zones (front/back, window/door)
   and attendance or behaviour issues?

5. OVERALL INSIGHT: One paragraph summary with the most critical action to take.

Be specific. Use actual student names. Max 350 words.
Return ONLY valid JSON:
{
  "disruption_clusters": [{"students": ["name1","name2"], "seats": "R2C3 and R2C4", "reason": "..."}],
  "recommended_pairs": [{"student_a": "name", "student_b": "name", "reason": "...", "projected_benefit": "..."}],
  "relocations": [{"student": "name", "from_seat": "R2C3", "to_seat": "R1C1", "reason": "..."}],
  "zone_patterns": "string",
  "overall_insight": "string"
}`

  const client = new Anthropic({ apiKey: anthropicKey })
  let insights: Record<string, unknown>

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages:   [{ role: 'user', content: prompt }],
    })
    const raw = (response.content[0] as { text: string }).text ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    insights = match ? JSON.parse(match[0]) : { overall_insight: raw }
  } catch {
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 })
  }

  // Persist insights on the arrangement
  await db
    .from('seating_arrangements')
    .update({ insights, last_insight_at: new Date().toISOString() })
    .eq('id', arrangement.id)

  return NextResponse.json({ insights })
}

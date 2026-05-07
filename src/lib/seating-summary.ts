// Recomputes the school-wide principal seating summary after any class is analysed.
// Called from /api/seating/analyze after saving class-level intelligence.

import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function updatePrincipalSeatingSummary(
  schoolId: string,
  term: number,
  academicYear: string
): Promise<void> {
  const db = createAdminSupabaseClient()

  const { data: classAnalyses } = await db
    .from('seating_intelligence')
    .select('class_name, stream_name, risk_count, urgent_move_count, recommended_moves, computed_at, seat_map_id')
    .eq('school_id', schoolId)
    .eq('term', term)
    .eq('academic_year', academicYear)
    .order('computed_at', { ascending: false })

  if (!classAnalyses?.length) return

  const totalRiskPairs = classAnalyses.reduce((s, c) => s + (c.risk_count ?? 0), 0)
  const totalUrgentMoves = classAnalyses.reduce((s, c) => s + (c.urgent_move_count ?? 0), 0)

  const highestRiskClass = classAnalyses.reduce<typeof classAnalyses[0]>((max, c) =>
    (c.risk_count ?? 0) > (max.risk_count ?? 0) ? c : max
  , classAnalyses[0])

  const classBreakdown = classAnalyses.map(c => ({
    class_name:    c.class_name,
    stream_name:   c.stream_name,
    risk_count:    c.risk_count ?? 0,
    urgent_moves:  c.urgent_move_count ?? 0,
    last_analysed: c.computed_at,
  }))

  const summaryLines: string[] = []
  if (totalRiskPairs > 0) {
    summaryLines.push(
      `${totalRiskPairs} discipline risk cluster(s) detected across ${classAnalyses.length} class(es).`
    )
  }
  if (totalUrgentMoves > 0) {
    summaryLines.push(
      `${totalUrgentMoves} urgent seat move(s) recommended — class teachers have been notified.`
    )
  }
  if ((highestRiskClass.risk_count ?? 0) > 0) {
    summaryLines.push(
      `Highest risk: ${highestRiskClass.class_name} ${highestRiskClass.stream_name} ` +
      `(${highestRiskClass.risk_count} risk pair(s)).`
    )
  }
  if (totalRiskPairs === 0) {
    summaryLines.push('No significant seating risks detected. Classrooms are well-arranged.')
  }

  const { count: totalClasses } = await db
    .from('classroom_seat_maps')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('term', term)
    .eq('is_active', true)

  await db.from('principal_seating_summary').upsert({
    school_id:          schoolId,
    term,
    academic_year:      academicYear,
    total_classes:      totalClasses ?? 0,
    classes_analysed:   classAnalyses.length,
    total_risk_pairs:   totalRiskPairs,
    total_urgent_moves: totalUrgentMoves,
    highest_risk_class: (highestRiskClass.risk_count ?? 0) > 0
      ? `${highestRiskClass.class_name} ${highestRiskClass.stream_name}`
      : null,
    executive_summary: summaryLines.join(' '),
    class_breakdown:   classBreakdown,
    computed_at:       new Date().toISOString(),
  }, { onConflict: 'school_id,term,academic_year' })
}

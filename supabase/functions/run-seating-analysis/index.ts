// Edge Function: run-seating-analysis
// Invoked weekly via pg_cron (Sunday 11 PM EAT).
// Loops all active schools → all active seat maps for current term →
// calls Claude for seating intelligence on each class →
// updates principal_seating_summary for each school.
// Classes with < 3 seated students are skipped.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Only service-role calls allowed
  const authHeader = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!authHeader.includes(serviceKey.slice(-20))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  const claude = new Anthropic({ apiKey: anthropicKey })

  const results: Array<{ school_id: string; class_name: string; status: string }> = []

  // Get all active seat maps across all schools
  const { data: seatMaps } = await db
    .from('classroom_seat_maps')
    .select('id, school_id, class_name, stream_name, rows, cols, term, academic_year')
    .eq('is_active', true)

  if (!seatMaps?.length) {
    return new Response(JSON.stringify({ message: 'No active seat maps found', results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Group by school
  const bySchool = new Map<string, typeof seatMaps>()
  for (const m of seatMaps) {
    const list = bySchool.get(m.school_id) ?? []
    list.push(m)
    bySchool.set(m.school_id, list)
  }

  for (const [schoolId, maps] of bySchool.entries()) {
    for (const seatMap of maps) {
      try {
        // Load assignments
        const { data: assignments } = await db
          .from('student_seat_assignments')
          .select('student_id, row_number, col_number, is_discipline_risk, is_high_performer, is_low_performer, adjacent_risk_score')
          .eq('seat_map_id', seatMap.id)
          .eq('is_active', true)

        if (!assignments || assignments.length < 3) {
          results.push({ school_id: schoolId, class_name: seatMap.class_name, status: 'skipped:too_few_students' })
          continue
        }

        const studentIds = assignments.map((a: { student_id: string }) => a.student_id)

        // Student names
        const { data: studentsData } = await db
          .from('students')
          .select('id, full_name')
          .in('id', studentIds)

        const nameMap = Object.fromEntries(
          (studentsData ?? []).map((s: { id: string; full_name: string }) => [s.id, s.full_name])
        )

        // Discipline (last 90 days)
        const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
        const { data: discipline } = await db
          .from('discipline_records')
          .select('student_id, offence, tone, created_at')
          .eq('school_id', schoolId)
          .in('student_id', studentIds)
          .gte('created_at', since)

        if (!discipline?.length) {
          results.push({ school_id: schoolId, class_name: seatMap.class_name, status: 'skipped:no_discipline_data' })
          continue
        }

        // Marks
        const { data: marksData } = await db
          .from('marks')
          .select('student_id, percentage')
          .eq('school_id', schoolId)
          .in('student_id', studentIds)
          .eq('term', String(seatMap.term))
          .eq('academic_year', seatMap.academic_year)
          .not('percentage', 'is', null)

        if (!marksData?.length) {
          results.push({ school_id: schoolId, class_name: seatMap.class_name, status: 'skipped:no_marks_data' })
          continue
        }

        // Compute averages
        const scoresByStudent: Record<string, number[]> = {}
        for (const m of marksData as Array<{ student_id: string; percentage: number }>) {
          if (!scoresByStudent[m.student_id]) scoresByStudent[m.student_id] = []
          scoresByStudent[m.student_id].push(m.percentage)
        }
        const avgByStudent: Record<string, number | null> = {}
        for (const sid of studentIds) {
          const s = scoresByStudent[sid]
          avgByStudent[sid] = s?.length ? Math.round(s.reduce((a: number, b: number) => a + b, 0) / s.length) : null
        }
        const validScores = Object.values(avgByStudent).filter((v): v is number => v !== null)
        const classAverage = validScores.length
          ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
          : 50

        const discByStudent: Record<string, number> = {}
        for (const d of discipline as Array<{ student_id: string }>) {
          discByStudent[d.student_id] = (discByStudent[d.student_id] ?? 0) + 1
        }

        const seatingPicture = (assignments as Array<{
          student_id: string; row_number: number; col_number: number
          is_discipline_risk: boolean; is_high_performer: boolean
          is_low_performer: boolean; adjacent_risk_score: number
        }>).map(a => ({
          seat:                 `Row ${a.row_number}, Col ${a.col_number}`,
          student_id:           a.student_id,
          name:                 nameMap[a.student_id] ?? 'Unknown',
          avg_score:            avgByStudent[a.student_id],
          score_vs_class:       avgByStudent[a.student_id] != null ? (avgByStudent[a.student_id] as number) - classAverage : null,
          discipline_incidents: discByStudent[a.student_id] ?? 0,
          is_discipline_risk:   a.is_discipline_risk,
          is_high_performer:    a.is_high_performer,
          is_low_performer:     a.is_low_performer,
          adjacent_risk_score:  a.adjacent_risk_score,
        }))

        const prompt = `Analyse seating for ${seatMap.class_name} ${seatMap.stream_name}, Term ${seatMap.term} ${seatMap.academic_year}.
Class: ${assignments.length} students. Average score: ${classAverage}%.
${JSON.stringify(seatingPicture)}
Return ONLY JSON: {"discipline_clusters":[],"performance_gaps":[],"recommended_moves":[],"class_summary":"","principal_summary":"","risk_count":0,"urgent_move_count":0}`

        const response = await claude.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 1500,
          messages:   [{ role: 'user', content: prompt }],
        })

        const raw   = (response.content[0] as { text: string }).text ?? ''
        const match = raw.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('No JSON in Claude response')
        const analysis = JSON.parse(match[0])

        await db.from('seating_intelligence').upsert({
          school_id:               schoolId,
          seat_map_id:             seatMap.id,
          class_name:              seatMap.class_name,
          stream_name:             seatMap.stream_name,
          term:                    seatMap.term,
          academic_year:           seatMap.academic_year,
          discipline_clusters:     analysis.discipline_clusters ?? [],
          performance_gaps:        analysis.performance_gaps ?? [],
          recommended_moves:       analysis.recommended_moves ?? [],
          class_summary:           analysis.class_summary ?? null,
          principal_summary:       analysis.principal_summary ?? null,
          risk_count:              analysis.risk_count ?? 0,
          urgent_move_count:       analysis.urgent_move_count ?? 0,
          computed_at:             new Date().toISOString(),
          discipline_records_count: discipline.length,
          marks_records_count:     marksData.length,
        }, { onConflict: 'school_id,seat_map_id' })

        results.push({ school_id: schoolId, class_name: seatMap.class_name, status: 'ok' })

      } catch (err) {
        console.error(`[run-seating-analysis] ${seatMap.class_name}:`, err)
        results.push({ school_id: schoolId, class_name: seatMap.class_name, status: `error:${String(err)}` })
      }
    }

    // Update principal summary for this school after all classes processed
    try {
      const { data: analyses } = await db
        .from('seating_intelligence')
        .select('class_name, stream_name, risk_count, urgent_move_count, computed_at')
        .eq('school_id', schoolId)

      if (analyses?.length) {
        const totalRisk   = analyses.reduce((s: number, c: { risk_count: number }) => s + (c.risk_count ?? 0), 0)
        const totalUrgent = analyses.reduce((s: number, c: { urgent_move_count: number }) => s + (c.urgent_move_count ?? 0), 0)
        const { count: totalMaps } = await db
          .from('classroom_seat_maps')
          .select('*', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('is_active', true)

        const currentTerm = maps[0].term
        const currentYear = maps[0].academic_year

        await db.from('principal_seating_summary').upsert({
          school_id:          schoolId,
          term:               currentTerm,
          academic_year:      currentYear,
          total_classes:      totalMaps ?? 0,
          classes_analysed:   analyses.length,
          total_risk_pairs:   totalRisk,
          total_urgent_moves: totalUrgent,
          executive_summary:  totalRisk > 0
            ? `${totalRisk} discipline risk cluster(s) across ${analyses.length} class(es). ${totalUrgent} urgent move(s) recommended.`
            : 'No significant seating risks detected.',
          class_breakdown: analyses.map((c: { class_name: string; stream_name: string; risk_count: number; urgent_move_count: number; computed_at: string }) => ({
            class_name:    c.class_name,
            stream_name:   c.stream_name,
            risk_count:    c.risk_count ?? 0,
            urgent_moves:  c.urgent_move_count ?? 0,
            last_analysed: c.computed_at,
          })),
          computed_at: new Date().toISOString(),
        }, { onConflict: 'school_id,term,academic_year' })
      }
    } catch (err) {
      console.error(`[run-seating-analysis] principal summary for ${schoolId}:`, err)
    }
  }

  const ok    = results.filter(r => r.status === 'ok').length
  const skipped = results.filter(r => r.status.startsWith('skipped')).length
  const errors  = results.filter(r => r.status.startsWith('error')).length

  return new Response(JSON.stringify({ ok, skipped, errors, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

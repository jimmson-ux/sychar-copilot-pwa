// GET /api/analytics/principal/school-mean
// Principal only. Cached 5 min.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { getCachedOrCompute } from '@/lib/analytics/cacheUtils'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const term = req.nextUrl.searchParams.get('term')
  if (!term) return NextResponse.json({ error: 'term is required' }, { status: 400 })

  const cacheKey = `school_mean:${term}`

  const result = await getCachedOrCompute(
    auth.schoolId,
    cacheKey,
    async () => {
      const db = admin()

      const { data: marks, error } = await db
        .from('marks')
        .select('student_id, subject_id, class_id, percentage, score, term, academic_year')
        .eq('school_id', auth.schoolId)
        .eq('term', term)

      if (error) throw error
      if (!marks?.length) {
        return {
          term,
          overall_mean: 0, previous_term_mean: 0,
          movement: 0, movement_direction: 'stable',
          by_level: [], by_subject: [],
          last_updated: new Date().toISOString(),
        }
      }

      // ── Current term school mean ──────────────────────────
      const allScores = marks.map(m => Number(m.percentage ?? m.score ?? 0))
      const overall_mean = parseFloat((allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(2))

      // ── Previous term mean ────────────────────────────────
      const { data: prevMarks } = await db
        .from('marks')
        .select('percentage, score')
        .eq('school_id', auth.schoolId)
        .neq('term', term)
        .order('academic_year', { ascending: false })
        .order('term', { ascending: false })
        .limit(10000)

      const prevScores = (prevMarks ?? []).map(m => Number(m.percentage ?? m.score ?? 0))
      const previous_term_mean = prevScores.length
        ? parseFloat((prevScores.reduce((a, b) => a + b, 0) / prevScores.length).toFixed(2))
        : overall_mean

      const movement = parseFloat((overall_mean - previous_term_mean).toFixed(2))
      const movement_direction: 'up' | 'down' | 'stable' =
        movement > 1 ? 'up' : movement < -1 ? 'down' : 'stable'

      // ── By level (Form 3, Form 4, Grade 10 etc.) ──────────
      const { data: students } = await db
        .from('students')
        .select('id, class_name')
        .eq('school_id', auth.schoolId)
        .eq('is_active', true)

      const classOf = new Map(students?.map(s => [s.id, s.class_name]) ?? [])

      const levelMap = new Map<string, number[]>()
      for (const m of marks) {
        const cls = classOf.get(m.student_id) ?? ''
        // Extract level prefix: 'Form 3 East' → 'Form 3'
        const lvl = cls.replace(/\s+(east|west|north|south|champions|achievers|winners|victors|\w+)$/i, '').trim()
        if (!levelMap.has(lvl)) levelMap.set(lvl, [])
        levelMap.get(lvl)!.push(Number(m.percentage ?? m.score ?? 0))
      }

      const by_level = Array.from(levelMap.entries()).map(([level, scores]) => {
        const mean = parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
        const curriculum_type = level.toLowerCase().startsWith('grade') ? 'CBC' : '844'
        return {
          level,
          mean,
          previous_mean: previous_term_mean, // approximate
          movement:      parseFloat((mean - previous_term_mean).toFixed(2)),
          student_count: new Set(marks.filter(m => {
            const cls = classOf.get(m.student_id) ?? ''
            return cls.startsWith(level)
          }).map(m => m.student_id)).size,
          curriculum_type,
        }
      }).sort((a, b) => a.level.localeCompare(b.level))

      // ── By subject ────────────────────────────────────────
      const { data: subjects } = await db
        .from('subjects')
        .select('id, name, department, curriculum_type')
        .eq('school_id', auth.schoolId)

      const subjectMeta = new Map(subjects?.map(s => [s.id, s]) ?? [])

      const subjectScores = new Map<string, number[]>()
      for (const m of marks) {
        if (!subjectScores.has(m.subject_id)) subjectScores.set(m.subject_id, [])
        subjectScores.get(m.subject_id)!.push(Number(m.percentage ?? m.score ?? 0))
      }

      const by_subject = Array.from(subjectScores.entries()).map(([sid, scores]) => {
        const meta  = subjectMeta.get(sid)
        const mean  = parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
        const pass  = parseFloat(((scores.filter(s => s >= 40).length / scores.length) * 100).toFixed(2))
        return {
          subject_name:     meta?.name ?? sid,
          department:       meta?.department ?? '',
          mean,
          pass_rate:        pass,
          curriculum_type:  meta?.curriculum_type ?? '844',
        }
      }).sort((a, b) => b.mean - a.mean)

      return {
        term,
        overall_mean,
        previous_term_mean,
        movement,
        movement_direction,
        by_level,
        by_subject,
        last_updated: new Date().toISOString(),
      }
    },
    5, // 5-min cache — ticker refreshes every 5 min
  )

  return NextResponse.json(result)
}

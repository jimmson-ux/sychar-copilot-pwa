// GET /api/analytics/deputy/at-risk-roster
// Available to: deputy_principal_academic + principal

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { getCachedOrCompute } from '@/lib/analytics/cacheUtils'

const ALLOWED = new Set(['deputy_principal_academic','deputy_principal_academics','principal','dean_of_studies'])

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

type RiskLevel = 'medium' | 'high' | 'critical'

function riskLevel(dropped: number): RiskLevel {
  if (dropped >= 5) return 'critical'
  if (dropped >= 3) return 'high'
  return 'medium'
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp        = req.nextUrl.searchParams
  const term      = sp.get('term')
  const threshold = parseInt(sp.get('threshold') ?? '2', 10)

  if (!term) return NextResponse.json({ error: 'term is required' }, { status: 400 })

  const cacheKey = `at_risk:${term}:thresh${threshold}`

  const result = await getCachedOrCompute(
    auth.schoolId,
    cacheKey,
    async () => {
      const db = admin()

      // ── Current term marks ──────────────────────────────
      const { data: currentMarks, error: cmErr } = await db
        .from('marks')
        .select('student_id, subject_id, percentage, score, term, academic_year')
        .eq('school_id', auth.schoolId)
        .eq('term', term)

      if (cmErr) throw new Error(cmErr.message)

      // ── Previous term marks ─────────────────────────────
      // Get marks from the same academic_year but previous term, or last year's last term
      const academicYears = [...new Set((currentMarks ?? []).map(m => m.academic_year).filter(Boolean))]
      const { data: prevMarks } = await db
        .from('marks')
        .select('student_id, subject_id, percentage, score, term, academic_year')
        .eq('school_id', auth.schoolId)
        .neq('term', term)
        .order('academic_year', { ascending: false })
        .order('term', { ascending: false })

      // Build lookup: studentId+subjectId → previous score
      const prevLookup = new Map<string, number>()
      for (const m of prevMarks ?? []) {
        const key = `${m.student_id}|${m.subject_id}`
        if (!prevLookup.has(key)) {
          prevLookup.set(key, Number(m.percentage ?? m.score ?? 0))
        }
      }

      // ── Group current marks by student ──────────────────
      const studentSubjects = new Map<string, Array<{ subject_id: string; current: number }>>()
      for (const m of currentMarks ?? []) {
        if (!studentSubjects.has(m.student_id)) studentSubjects.set(m.student_id, [])
        studentSubjects.get(m.student_id)!.push({
          subject_id: m.subject_id,
          current:    Number(m.percentage ?? m.score ?? 0),
        })
      }

      // ── Fetch student + class info ──────────────────────
      const studentIds = [...studentSubjects.keys()]
      const { data: students } = await db
        .from('students')
        .select('id, name, admission_number, class_name, stream_id')
        .eq('school_id', auth.schoolId)
        .in('id', studentIds)

      const studentInfo = new Map(students?.map(s => [s.id, s]) ?? [])

      // ── Subject name lookup ─────────────────────────────
      const allSubjectIds = [...new Set((currentMarks ?? []).map(m => m.subject_id))]
      const { data: subjects } = await db
        .from('subjects')
        .select('id, name')
        .in('id', allSubjectIds)
        .eq('school_id', auth.schoolId)

      const subjectName = new Map(subjects?.map(s => [s.id, s.name]) ?? [])

      // ── Class teacher lookup ─────────────────────────────
      const { data: classteachers } = await db
        .from('staff_records')
        .select('assigned_class_name, full_name')
        .eq('school_id', auth.schoolId)
        .eq('sub_role', 'class_teacher')
        .not('assigned_class_name', 'is', null)

      const ctByClass = new Map(classteachers?.map(ct => [ct.assigned_class_name, ct.full_name]) ?? [])

      // ── Welfare / G&C check ──────────────────────────────
      const { data: welfareRows } = await db
        .from('welfare_logs')
        .select('student_id, session_date')
        .eq('school_id', auth.schoolId)
        .in('student_id', studentIds)
        .order('session_date', { ascending: false })

      const gcByStudent = new Map<string, string>()
      for (const w of welfareRows ?? []) {
        if (!gcByStudent.has(w.student_id)) {
          gcByStudent.set(w.student_id, w.session_date)
        }
      }

      // ── Build at-risk roster ─────────────────────────────
      const roster = []

      for (const [sid, subjects_data] of studentSubjects) {
        let droppedCount = 0
        let currentTotal = 0
        let prevTotal    = 0
        let prevCount    = 0
        const dropped_subjects = []

        for (const { subject_id, current } of subjects_data) {
          currentTotal += current
          const prevScore = prevLookup.get(`${sid}|${subject_id}`)
          if (prevScore !== undefined) {
            prevTotal += prevScore
            prevCount++
            const delta = current - prevScore
            if (delta < -10) {
              droppedCount++
              dropped_subjects.push({
                subject_name:   subjectName.get(subject_id) ?? subject_id,
                current_score:  parseFloat(current.toFixed(2)),
                previous_score: parseFloat(prevScore.toFixed(2)),
                delta:          parseFloat(delta.toFixed(2)),
              })
            }
          }
        }

        if (droppedCount < threshold) continue

        const info         = studentInfo.get(sid)
        const current_mean = parseFloat((currentTotal / subjects_data.length).toFixed(2))
        const previous_mean = prevCount > 0
          ? parseFloat((prevTotal / prevCount).toFixed(2))
          : current_mean
        const mean_delta   = parseFloat((current_mean - previous_mean).toFixed(2))

        const gcDate = gcByStudent.get(sid)
        const daysSinceFlagged = gcDate
          ? Math.floor((Date.now() - new Date(gcDate).getTime()) / 86_400_000)
          : null

        roster.push({
          student_id:       sid,
          virtual_qr_id:    info?.admission_number ?? sid,
          class:            info?.class_name ?? '',
          stream:           '',
          class_teacher:    ctByClass.get(info?.class_name ?? '') ?? '',
          current_mean,
          previous_mean,
          mean_delta,
          subjects_dropped: droppedCount,
          dropped_subjects: dropped_subjects.sort((a, b) => a.delta - b.delta),
          gc_referral_exists: gcByStudent.has(sid),
          last_intervention:  gcDate ?? null,
          risk_level:         riskLevel(droppedCount),
          days_since_flagged: daysSinceFlagged,
        })
      }

      roster.sort((a, b) => b.subjects_dropped - a.subjects_dropped || a.mean_delta - b.mean_delta)

      // ── By-class summary ─────────────────────────────────
      const classCounts = new Map<string, { at_risk: number; total: number }>()
      for (const r of roster) {
        const k = r.class
        if (!classCounts.has(k)) {
          const classTotal = [...studentSubjects.keys()].filter(sid => {
            return studentInfo.get(sid)?.class_name === k
          }).length
          classCounts.set(k, { at_risk: 0, total: classTotal })
        }
        classCounts.get(k)!.at_risk++
      }

      const by_class = Array.from(classCounts.entries()).map(([class_name, c]) => ({
        class_name,
        stream_name:   '',
        at_risk_count: c.at_risk,
        class_total:   c.total,
        percentage:    c.total > 0 ? parseFloat(((c.at_risk / c.total) * 100).toFixed(2)) : 0,
      }))

      return {
        term,
        threshold_subjects: threshold,
        total_at_risk:      roster.length,
        roster,
        by_class,
      }
    },
    15, // 15-min cache
  )

  return NextResponse.json(result)
}

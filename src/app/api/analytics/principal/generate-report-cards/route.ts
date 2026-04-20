// POST /api/analytics/principal/generate-report-cards
// Kicks off async PDF generation job, returns job_id to poll.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import {
  calculateGrade844,
  calculateGradeCBC,
  calculateMeanGrade844,
  calculateMeanGradeCBC,
} from '@/lib/analytics/gradeUtils'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const sp       = req.nextUrl.searchParams
  const class_id = sp.get('class_id') ?? undefined
  const term     = sp.get('term')
  const aca_year = sp.get('academic_year') ?? new Date().getFullYear().toString()

  if (!term) return NextResponse.json({ error: 'term is required' }, { status: 400 })

  const db = admin()

  // ── Create job record ─────────────────────────────────────
  const { data: job, error: jobErr } = await db
    .from('report_card_jobs')
    .insert({
      school_id:    auth.schoolId,
      created_by:   auth.userId,
      status:       'processing',
      progress:     0,
      term,
      academic_year: aca_year,
      class_id:     class_id ?? null,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }

  const jobId = job.id

  // ── Fire-and-forget: generate cards in background ─────────
  // Using setImmediate to return the response immediately while processing continues.
  setImmediate(async () => {
    try {
      // Fetch students in scope
      let studQuery = db
        .from('students')
        .select('id, name, admission_number, class_name')
        .eq('school_id', auth.schoolId)
        .eq('is_active', true)

      if (class_id) studQuery = studQuery.eq('class_id', class_id)

      const { data: students } = await studQuery
      if (!students?.length) {
        await db.from('report_card_jobs').update({
          status: 'complete', progress: 100, report_count: 0, completed_at: new Date().toISOString(),
        }).eq('id', jobId)
        return
      }

      const total = students.length
      let done    = 0
      let cbc     = 0
      let legacy  = 0

      // Fetch all marks for this term
      const { data: allMarks } = await db
        .from('marks')
        .select('student_id, subject_id, percentage, score, grade, exam_type')
        .eq('school_id', auth.schoolId)
        .eq('term', term)
        .eq('academic_year', aca_year)

      // Fetch subjects meta
      const { data: subjects } = await db
        .from('subjects')
        .select('id, name, department, curriculum_type')
        .eq('school_id', auth.schoolId)

      const subjectMeta = new Map(subjects?.map(s => [s.id, s]) ?? [])

      // Fetch attendance
      const { data: attendance } = await db
        .from('attendance_records')
        .select('student_id, status')
        .eq('school_id', auth.schoolId)

      const attendanceByStudent = new Map<string, { present: number; total: number }>()
      for (const a of attendance ?? []) {
        if (!attendanceByStudent.has(a.student_id)) {
          attendanceByStudent.set(a.student_id, { present: 0, total: 0 })
        }
        const r = attendanceByStudent.get(a.student_id)!
        r.total++
        if (a.status === 'present') r.present++
      }

      // Fetch school profile for letterhead
      const { data: school } = await db
        .from('schools')
        .select('name, address, logo_url, motto')
        .eq('id', auth.schoolId)
        .single()

      // Process each student — build JSON card data (PDF rendering deferred)
      const cardData = []
      for (const s of students) {
        const sMarks = (allMarks ?? []).filter(m => m.student_id === s.id)
        const isCBC  = (s.class_name ?? '').toLowerCase().startsWith('grade')

        if (isCBC) cbc++; else legacy++

        const subjectRows = sMarks.map(m => {
          const meta   = subjectMeta.get(m.subject_id)
          const score  = Number(m.percentage ?? m.score ?? 0)
          const gradeInfo = isCBC
            ? calculateGradeCBC(score)
            : calculateGrade844(score)
          return {
            subject:    meta?.name ?? '',
            department: meta?.department ?? '',
            score,
            grade:      isCBC ? (gradeInfo as ReturnType<typeof calculateGradeCBC>).grade_code : (gradeInfo as ReturnType<typeof calculateGrade844>).grade,
            level:      isCBC ? (gradeInfo as ReturnType<typeof calculateGradeCBC>).level : '',
            points:     gradeInfo.points,
          }
        })

        const meanData = isCBC
          ? calculateMeanGradeCBC(subjectRows.map(r => r.points))
          : calculateMeanGrade844(subjectRows.map(r => r.points))

        const att = attendanceByStudent.get(s.id)

        cardData.push({
          student:       s,
          class_name:    s.class_name,
          term,
          academic_year: aca_year,
          curriculum:    isCBC ? 'CBC' : '844',
          subjects:      subjectRows,
          mean:          meanData,
          attendance:    att ?? { present: 0, total: 0 },
          school:        school ?? { name: '', address: '', logo_url: '' },
        })

        done++
        // Update progress every 10 students
        if (done % 10 === 0 || done === total) {
          await db.from('report_card_jobs').update({
            progress:     Math.round((done / total) * 95),
            report_count: done,
            cbc_count:    cbc,
            legacy_count: legacy,
          }).eq('id', jobId)
        }
      }

      // Store card data as JSON in analytics_cache (lightweight — no PDF lib needed at this stage)
      await db.from('analytics_cache').upsert({
        school_id:   auth.schoolId,
        cache_key:   `report_cards:${jobId}`,
        payload:     { cards: cardData, generated_at: new Date().toISOString() },
        computed_at: new Date().toISOString(),
      }, { onConflict: 'school_id,cache_key' })

      await db.from('report_card_jobs').update({
        status:       'complete',
        progress:     100,
        report_count: total,
        cbc_count:    cbc,
        legacy_count: legacy,
        download_url: `/api/analytics/principal/report-cards/${jobId}`,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await db.from('report_card_jobs').update({
        status: 'failed', error_message: msg,
      }).eq('id', jobId)
    }
  })

  // Estimate: ~0.5s per student
  const { count: studentCount } = await db
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)

  return NextResponse.json({
    status:            'processing',
    job_id:            jobId,
    estimated_seconds: Math.ceil((studentCount ?? 100) * 0.5),
  })
}

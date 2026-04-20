// GET /api/principal/appraisals — compute + return all staff appraisals for a term
// Computation pulled live from: lesson_logs, lesson_heartbeats, syllabus_progress, marks, compliance_tracking

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db     = svc()
  const termId = req.nextUrl.searchParams.get('term_id') ?? currentTermId()

  // Fetch all teaching staff
  const { data: staffList } = await db
    .from('staff_records')
    .select('id, full_name, subject_specialization, employment_type')
    .eq('school_id', auth.schoolId!)
    .eq('active', true)
    .in('role', ['teacher', 'deputy', 'deputy_principal'])

  if (!staffList?.length) return NextResponse.json({ appraisals: [] })

  const staffIds = staffList.map((s: { id: string }) => s.id)
  const [termStart, termEnd] = termDateRange(termId)

  // Batch-fetch all metrics in parallel
  const [
    lessonLogsRes,
    heartbeatsRes,
    syllabusRes,
    marksRes,
    complianceRes,
    scheduledRes,
    existingAppraisalsRes,
  ] = await Promise.all([
    // Metric 1: Punctuality — lesson check-ins
    db.from('lesson_logs')
      .select('staff_id, status, scheduled_start, check_in_time')
      .eq('school_id', auth.schoolId!)
      .gte('scheduled_start', termStart)
      .lte('scheduled_start', termEnd)
      .in('staff_id', staffIds),

    // Metric 2: Completion — heartbeats
    db.from('lesson_heartbeats')
      .select('staff_id, lesson_minutes, teacher_present_minutes')
      .eq('school_id', auth.schoolId!)
      .gte('logged_at', termStart)
      .lte('logged_at', termEnd)
      .in('staff_id', staffIds),

    // Metric 3: Syllabus velocity
    db.from('syllabus_progress')
      .select('staff_id, velocity_score, updated_at')
      .eq('school_id', auth.schoolId!)
      .gte('updated_at', termStart)
      .in('staff_id', staffIds),

    // Metric 4: Marks (student outcomes)
    db.from('marks')
      .select('staff_id, student_id, score, max_score, term_id, subject_id')
      .eq('school_id', auth.schoolId!)
      .eq('term_id', termId)
      .in('staff_id', staffIds),

    // Metric 5: Compliance
    db.from('compliance_tracking')
      .select('staff_id, task_type, status, due_date, submitted_at')
      .eq('school_id', auth.schoolId!)
      .gte('due_date', termStart)
      .lte('due_date', termEnd)
      .in('staff_id', staffIds),

    // Total scheduled lessons per teacher
    db.from('timetable_slots')
      .select('staff_id')
      .eq('school_id', auth.schoolId!)
      .in('staff_id', staffIds),

    // Previously saved appraisals (for remarks)
    db.from('staff_appraisals')
      .select('staff_id, principal_remarks, shared_with_teacher, rating')
      .eq('school_id', auth.schoolId!)
      .eq('term_id', termId)
      .in('staff_id', staffIds),
  ])

  const logs         = lessonLogsRes.data       ?? []
  const beats        = heartbeatsRes.data        ?? []
  const syllabus     = syllabusRes.data          ?? []
  const marks        = marksRes.data             ?? []
  const compliance   = complianceRes.data        ?? []
  const scheduled    = scheduledRes.data         ?? []
  const existing     = existingAppraisalsRes.data ?? []

  // Index existing appraisals by staff_id
  const existingMap = new Map<string, { principal_remarks: string | null; shared_with_teacher: boolean }>()
  for (const e of existing as { staff_id: string; principal_remarks: string | null; shared_with_teacher: boolean }[]) {
    existingMap.set(e.staff_id, e)
  }

  const appraisals = staffList.map((staff: { id: string; full_name: string; subject_specialization: string | null }) => {
    // ── Metric 1: Punctuality ───────────────────────────────────────────────
    const staffLogs       = (logs as { staff_id: string; status: string }[]).filter(l => l.staff_id === staff.id)
    const totalScheduled  = (scheduled as { staff_id: string }[]).filter(s => s.staff_id === staff.id).length
    const onTime          = staffLogs.filter(l => l.status === 'on_time').length
    const punctuality     = totalScheduled > 0 ? (onTime / totalScheduled) * 100 : null

    // ── Metric 2: Lesson Completion ─────────────────────────────────────────
    const staffBeats = (beats as { staff_id: string; lesson_minutes: number; teacher_present_minutes: number }[])
      .filter(b => b.staff_id === staff.id && b.lesson_minutes > 0)
    const completions = staffBeats.map(b => (b.teacher_present_minutes / b.lesson_minutes) * 100)
    const completion  = completions.length > 0 ? completions.reduce((a, b) => a + b, 0) / completions.length : null

    // ── Metric 3: Syllabus Velocity ─────────────────────────────────────────
    const staffSyllabus = (syllabus as { staff_id: string; velocity_score: number }[]).filter(s => s.staff_id === staff.id)
    const velocityRaw   = staffSyllabus.length > 0
      ? staffSyllabus.reduce((a, s) => a + s.velocity_score, 0) / staffSyllabus.length
      : null
    const velocity = velocityRaw !== null ? Math.min(100, velocityRaw) : null

    // ── Metric 4: Student Outcomes ──────────────────────────────────────────
    const staffMarks = (marks as { staff_id: string; score: number; max_score: number }[]).filter(m => m.staff_id === staff.id)
    let outcome: number | null = null
    if (staffMarks.length > 0) {
      const avg = staffMarks.reduce((a, m) => a + (m.score / m.max_score) * 100, 0) / staffMarks.length
      // Normalize: 50 avg = 50 score, 80 avg = 100 score, scale linearly
      outcome = Math.min(100, Math.max(0, (avg - 30) * (100 / 50)))
    }

    // ── Metric 5: Compliance ────────────────────────────────────────────────
    const staffComp    = (compliance as { staff_id: string; status: string; due_date: string; submitted_at: string | null }[]).filter(c => c.staff_id === staff.id)
    const compTotal    = staffComp.length
    const onTimeComp   = staffComp.filter(c => c.status === 'submitted' && c.submitted_at !== null && new Date(c.submitted_at) <= new Date(c.due_date)).length
    const compScore    = compTotal > 0 ? (onTimeComp / compTotal) * 100 : null

    // ── Overall (weighted) ──────────────────────────────────────────────────
    const weights  = [0.20, 0.20, 0.20, 0.25, 0.15]
    const scores   = [punctuality, completion, velocity, outcome, compScore]
    const present  = scores.map((s, i) => s !== null ? [s, weights[i]] : null).filter(Boolean) as [number, number][]
    const totalW   = present.reduce((a, [, w]) => a + w, 0)
    const overall  = present.length > 0
      ? present.reduce((a, [s, w]) => a + s * w, 0) / totalW
      : null

    const rating = overall === null ? null
      : overall >= 85 ? 'Exceeds Expectations'
      : overall >= 70 ? 'Meeting Expectations'
      : overall >= 50 ? 'Needs Improvement'
      :                  'Critical'

    const saved = existingMap.get(staff.id)

    return {
      staff_id:            staff.id,
      staff_name:          staff.full_name,
      subject:             staff.subject_specialization,
      term_id:             termId,
      punctuality_score:   round2(punctuality),
      completion_score:    round2(completion),
      velocity_score:      round2(velocity),
      outcome_score:       round2(outcome),
      compliance_score:    round2(compScore),
      overall_score:       round2(overall),
      rating,
      principal_remarks:   saved?.principal_remarks ?? null,
      shared_with_teacher: saved?.shared_with_teacher ?? false,
      data_points: {
        lessons_logged:      staffLogs.length,
        heartbeat_sessions:  staffBeats.length,
        compliance_tasks:    compTotal,
        marks_entered:       staffMarks.length,
      },
    }
  })

  // Sort: Critical first, then Exceeds last
  const ratingOrder = ['Critical', 'Needs Improvement', 'Meeting Expectations', 'Exceeds Expectations']
  appraisals.sort((a, b) => ratingOrder.indexOf(a.rating ?? '') - ratingOrder.indexOf(b.rating ?? ''))

  return NextResponse.json({ appraisals, term_id: termId })
}

function round2(n: number | null) { return n !== null ? Math.round(n * 100) / 100 : null }

function currentTermId() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth() + 1
  const t   = m <= 4 ? 1 : m <= 8 ? 2 : 3
  return `${y}-T${t}`
}

function termDateRange(termId: string): [string, string] {
  const [year, t] = termId.split('-T')
  const y = parseInt(year)
  if (t === '1') return [`${y}-01-01`, `${y}-04-30`]
  if (t === '2') return [`${y}-05-01`, `${y}-08-31`]
  return [`${y}-09-01`, `${y}-12-31`]
}

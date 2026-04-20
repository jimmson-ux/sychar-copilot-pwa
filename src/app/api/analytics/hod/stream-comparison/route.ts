// GET /api/analytics/hod/stream-comparison
// Available to: hod_* roles + deputy_academic + principal
// Scoped to: HOD's own department subjects only

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import {
  calculateGrade844,
  calculateGradeCBC,
} from '@/lib/analytics/gradeUtils'

const HOD_ROLES = new Set([
  'hod_subjects', 'hod_pathways', 'hod_sciences',
  'hod_mathematics', 'hod_languages', 'hod_humanities',
  'hod_applied_sciences', 'hod_games_sports',
  'dean_of_studies', 'deputy_principal_academic',
  'deputy_principal_academics', 'principal',
])

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

  if (!HOD_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp          = req.nextUrl.searchParams
  const subjectId   = sp.get('subject_id')
  const classLevel  = sp.get('class_level')  // e.g. 'Form 3' or 'Grade 10'
  const term        = sp.get('term')

  if (!subjectId || !classLevel || !term) {
    return NextResponse.json(
      { error: 'subject_id, class_level, and term are required' },
      { status: 400 },
    )
  }

  const db = admin()

  // ── Validate HOD owns this subject's department ───────────
  const { data: subject } = await db
    .from('subjects')
    .select('name, department, curriculum_type')
    .eq('id', subjectId)
    .eq('school_id', auth.schoolId)
    .single()

  if (!subject) {
    return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
  }

  if (!['principal', 'deputy_principal_academic', 'deputy_principal_academics', 'dean_of_studies'].includes(auth.subRole)) {
    const { data: staffRow } = await db
      .from('staff_records')
      .select('department')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (staffRow?.department && subject.department &&
        staffRow.department.toLowerCase() !== subject.department.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden: not your department' }, { status: 403 })
    }
  }

  // ── Fetch marks for this subject + term across all streams ─
  const { data: marks, error } = await db
    .from('marks')
    .select('student_id, class_id, score, percentage, grade, exam_type, term')
    .eq('school_id', auth.schoolId)
    .eq('subject_id', subjectId)
    .eq('term', term)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!marks?.length) {
    return NextResponse.json({ streams: [], variance_flag: false, variance_percentage: 0, insight: 'No marks found for this period.' })
  }

  // ── Get students with stream info ─────────────────────────
  const studentIds = [...new Set(marks.map(m => m.student_id))]

  const { data: students } = await db
    .from('students')
    .select('id, class_name, stream_id')
    .eq('school_id', auth.schoolId)
    .in('id', studentIds)

  // Map student → class/stream info
  const studentInfo = new Map(students?.map(s => [s.id, s]) ?? [])

  // ── Filter to the requested class_level ──────────────────
  // class_level is like 'Form 3' — match students whose class_name starts with it
  const filteredMarks = marks.filter(m => {
    const s = studentInfo.get(m.student_id)
    return s?.class_name?.toLowerCase().startsWith(classLevel.toLowerCase())
  })

  if (!filteredMarks.length) {
    return NextResponse.json({
      streams: [],
      variance_flag: false,
      variance_percentage: 0,
      insight: `No marks found for ${classLevel} in term ${term}`,
    })
  }

  // ── Group by stream (use class_name as stream proxy) ──────
  const streamMap = new Map<string, { scores: number[]; studentIds: string[] }>()

  for (const m of filteredMarks) {
    const s = studentInfo.get(m.student_id)
    const streamKey = s?.class_name ?? 'Unknown'
    if (!streamMap.has(streamKey)) {
      streamMap.set(streamKey, { scores: [], studentIds: [] })
    }
    streamMap.get(streamKey)!.scores.push(Number(m.percentage ?? m.score ?? 0))
    streamMap.get(streamKey)!.studentIds.push(m.student_id)
  }

  // ── Get teacher per class from timetable ──────────────────
  const { data: timetableRows } = await db
    .from('timetable')
    .select('class_name, teacher_id')
    .eq('school_id', auth.schoolId)
    .not('teacher_id', 'is', null)

  const teacherByClass = new Map<string, string>()
  for (const t of timetableRows ?? []) {
    if (!teacherByClass.has(t.class_name)) {
      teacherByClass.set(t.class_name, t.teacher_id)
    }
  }

  // Resolve teacher names
  const teacherIds = [...new Set([...teacherByClass.values()])].filter(Boolean)
  const { data: staffRows } = teacherIds.length
    ? await db.from('staff_records').select('id, full_name').in('id', teacherIds)
    : { data: [] }
  const teacherName = new Map(staffRows?.map(s => [s.id, s.full_name]) ?? [])

  // ── Build stream objects ───────────────────────────────────
  const isCBC = (subject.curriculum_type ?? '844') === 'CBC' || classLevel.toLowerCase().startsWith('grade')

  const streamList = Array.from(streamMap.entries()).map(([stream_name, data]) => {
    const { scores } = data
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const class_average = parseFloat(avg.toFixed(2))

    // Grade distribution
    const dist: Record<string, number> = {}
    for (const s of scores) {
      const label = isCBC
        ? calculateGradeCBC(s).grade_code
        : calculateGrade844(s).grade
      dist[label] = (dist[label] ?? 0) + 1
    }

    const tid = teacherByClass.get(stream_name)
    return {
      stream_name,
      teacher_id:   tid ?? '',
      teacher_name: tid ? (teacherName.get(tid) ?? 'Unknown') : 'Not assigned',
      student_count:     scores.length,
      class_average,
      grade_distribution: dist,
      rank: 0, // set below
    }
  })
    .sort((a, b) => b.class_average - a.class_average)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  // ── Variance check ────────────────────────────────────────
  const averages = streamList.map(s => s.class_average)
  const best     = Math.max(...averages)
  const worst    = Math.min(...averages)
  const variance_percentage = parseFloat((best - worst).toFixed(2))
  const variance_flag       = variance_percentage > 15

  let insight = `${streamList.length} stream(s) analysed for ${subject.name} in ${classLevel} (${term}).`
  if (variance_flag && streamList.length >= 2) {
    const top = streamList[0]
    const bot = streamList[streamList.length - 1]
    insight = `${top.stream_name} (${top.teacher_name}) is averaging ${variance_percentage.toFixed(0)}% higher than ${bot.stream_name} (${bot.teacher_name}) in ${subject.name}. Consider peer observation.`
  }

  return NextResponse.json({
    subject_name:       subject.name,
    class_level:        classLevel,
    term,
    streams:            streamList,
    variance_flag,
    variance_percentage,
    insight,
  })
}

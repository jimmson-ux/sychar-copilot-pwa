// src/lib/hodData.ts
// Shared data-fetching and aggregation for the HOD dashboard.
// Called by both /api/hod (GET) and /api/hod/insights (POST) so that
// insights never needs to make an internal HTTP fetch to /api/hod.

import { SupabaseClient } from '@supabase/supabase-js'

interface PerfBucket {
  stream_id: string
  subject_id: string
  count: number
  sum_pct: number
  failing: number
  grade_dist: Record<string, number>
}

interface CovBucket {
  stream_id: string
  subject_id: string
  total_topics: number
  done_topics: number
  total_lessons: number
  done_lessons: number
}

export async function fetchHodData(sb: SupabaseClient, schoolId: string) {
  const [
    { data: streams,  error: streamsErr  },
    { data: classes,  error: classesErr  },
    { data: subjects, error: subjectsErr },
    { data: marks,    error: marksErr    },
    { data: syllabus, error: syllabusErr },
  ] = await Promise.all([
    sb.from('streams')
      .select('id, name, colour_hex, sort_order')
      .eq('school_id', schoolId)
      .order('sort_order'),

    sb.from('classes')
      .select('id, name, stream_id, year_group, academic_year, curriculum_type')
      .eq('school_id', schoolId),

    sb.from('subjects')
      .select('id, name, department, code')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('name'),

    sb.from('marks')
      .select('class_id, subject_id, percentage, grade')
      .eq('school_id', schoolId)
      .not('percentage', 'is', null),

    sb.from('syllabus_progress')
      .select('class_id, subject_id, stream_id, topic_name, lessons_planned, is_completed')
      .eq('school_id', schoolId),
  ])

  if (streamsErr)  throw new Error('streams: '  + streamsErr.message)
  if (classesErr)  throw new Error('classes: '  + classesErr.message)
  if (subjectsErr) throw new Error('subjects: ' + subjectsErr.message)
  if (marksErr)    throw new Error('marks: '    + marksErr.message)
  if (syllabusErr) throw new Error('syllabus: ' + syllabusErr.message)

  const classMap   = new Map((classes   ?? []).map(c => [c.id, c]))
  const subjectMap = new Map((subjects  ?? []).map(s => [s.id, s]))
  const streamMap  = new Map((streams   ?? []).map(s => [s.id, s]))

  // ── Aggregate marks by stream × subject ──────────────────────────────────
  const perfBuckets = new Map<string, PerfBucket>()

  for (const m of marks ?? []) {
    const cls = classMap.get(m.class_id)
    if (!cls) continue
    const key = `${cls.stream_id}|${m.subject_id}`
    if (!perfBuckets.has(key)) {
      perfBuckets.set(key, {
        stream_id: cls.stream_id, subject_id: m.subject_id,
        count: 0, sum_pct: 0, failing: 0, grade_dist: {},
      })
    }
    const b = perfBuckets.get(key)!
    b.count++
    b.sum_pct += m.percentage ?? 0
    if (m.grade === 'E') b.failing++
    const g = m.grade ?? '?'
    b.grade_dist[g] = (b.grade_dist[g] ?? 0) + 1
  }

  const performance = Array.from(perfBuckets.values()).map(b => ({
    stream_id:   b.stream_id,
    stream_name: streamMap.get(b.stream_id)?.name ?? '',
    subject_id:  b.subject_id,
    subject_name: subjectMap.get(b.subject_id)?.name ?? '',
    department:  subjectMap.get(b.subject_id)?.department ?? '',
    count:    b.count,
    avg_pct:  b.count > 0 ? Math.round((b.sum_pct / b.count) * 10) / 10 : 0,
    fail_rate: b.count > 0 ? Math.round((b.failing / b.count) * 1000) / 10 : 0,
    pass_rate: b.count > 0 ? Math.round(((b.count - b.failing) / b.count) * 1000) / 10 : 0,
    grade_dist: b.grade_dist,
  }))

  // ── Aggregate syllabus coverage by stream × subject ───────────────────────
  const covBuckets = new Map<string, CovBucket>()

  for (const row of syllabus ?? []) {
    const streamId = row.stream_id ?? classMap.get(row.class_id)?.stream_id
    if (!streamId || !row.subject_id) continue
    const key = `${streamId}|${row.subject_id}`
    if (!covBuckets.has(key)) {
      covBuckets.set(key, {
        stream_id: streamId, subject_id: row.subject_id,
        total_topics: 0, done_topics: 0, total_lessons: 0, done_lessons: 0,
      })
    }
    const b = covBuckets.get(key)!
    b.total_topics++
    if (row.is_completed) b.done_topics++
    const lessons = row.lessons_planned ?? 0
    b.total_lessons += lessons
    if (row.is_completed) b.done_lessons += lessons
  }

  const coverage = Array.from(covBuckets.values()).map(b => ({
    stream_id:    b.stream_id,
    stream_name:  streamMap.get(b.stream_id)?.name ?? '',
    subject_id:   b.subject_id,
    subject_name: subjectMap.get(b.subject_id)?.name ?? '',
    department:   subjectMap.get(b.subject_id)?.department ?? '',
    topics_total: b.total_topics,
    topics_done:  b.done_topics,
    coverage_pct: b.total_topics > 0
      ? Math.round((b.done_topics / b.total_topics) * 1000) / 10
      : 0,
    lessons_planned: b.total_lessons,
    lessons_done:    b.done_lessons,
  }))

  const coverageMap = new Map(coverage.map(c => [`${c.stream_id}|${c.subject_id}`, c]))
  const correlation = performance.map(p => ({
    ...p,
    coverage_pct: coverageMap.get(`${p.stream_id}|${p.subject_id}`)?.coverage_pct ?? null,
    topics_total: coverageMap.get(`${p.stream_id}|${p.subject_id}`)?.topics_total ?? 0,
    topics_done:  coverageMap.get(`${p.stream_id}|${p.subject_id}`)?.topics_done ?? 0,
  }))

  return {
    streams:  streams  ?? [],
    subjects: subjects ?? [],
    performance,
    coverage,
    correlation,
  }
}

'use server'

import { createClient } from '@supabase/supabase-js'
import { requireAuth }  from '@/lib/requireAuth'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Coverage % per subject for a class ───────────────────────────
export async function getSyllabusCoverage(classId: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('syllabus_progress')
    .select(`
      id, status, completed_at,
      syllabus_topics!topic_id (
        subject, class_level, topic_name, expected_week, sort_order
      )
    `)
    .eq('school_id', auth.schoolId)
    .eq('class_id', classId)

  if (error) throw new Error('Failed to fetch syllabus coverage')

  const bySubject: Record<string, { total: number; completed: number }> = {}
  for (const row of data ?? []) {
    const topic   = row.syllabus_topics as unknown as { subject: string } | null
    const subject = topic?.subject ?? 'Unknown'
    if (!bySubject[subject]) bySubject[subject] = { total: 0, completed: 0 }
    bySubject[subject].total++
    if (row.status === 'Completed') bySubject[subject].completed++
  }

  return Object.entries(bySubject).map(([subject, s]) => ({
    subject,
    total:     s.total,
    completed: s.completed,
    coverage:  s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
  }))
}

// ── Mark a topic complete ─────────────────────────────────────────
export async function markTopicComplete(topicId: string, classId: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('syllabus_progress')
    .upsert({
      school_id:    auth.schoolId,
      topic_id:     topicId,
      class_id:     classId,
      teacher_id:   auth.userId,
      status:       'Completed',
      completed_at: new Date().toISOString().slice(0, 10),
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'topic_id,class_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ── Topics behind expected schedule ──────────────────────────────
export async function getBehindScheduleTopics() {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const now         = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 4)
  const currentWeek = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  )

  const admin = getAdmin()
  const { data, error } = await admin
    .from('syllabus_progress')
    .select(`
      id, class_id, class_name, status,
      syllabus_topics!topic_id ( topic_name, subject, expected_week ),
      staff_records!teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .not('status', 'in', '("Completed","Skipped")')

  if (error) throw new Error('Failed to fetch syllabus progress')

  return (data ?? [])
    .map((row) => {
      const topic    = row.syllabus_topics as unknown as { expected_week: number; topic_name: string; subject: string } | null
      const weeksLate = topic ? Math.max(0, currentWeek - (topic.expected_week ?? currentWeek)) : 0
      return { ...row, weeksLate, flag: weeksLate >= 2 ? 'RED' : weeksLate >= 1 ? 'AMBER' : null }
    })
    .filter((r) => r.flag !== null)
    .sort((a, b) => b.weeksLate - a.weeksLate)
}

// ── Create a syllabus topic (HOD / admin) ─────────────────────────
export async function createSyllabusTopic(payload: {
  subject:         string
  classLevel?:     string
  topicName:       string
  subtopicName?:   string
  expectedWeek?:   number
  expectedTerm?:   number
  curriculumType?: string
  sortOrder?:      number
}) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('syllabus_topics')
    .insert({
      school_id:       auth.schoolId,
      subject:         payload.subject,
      class_level:     payload.classLevel   ?? null,
      topic_name:      payload.topicName,
      subtopic_name:   payload.subtopicName ?? null,
      expected_week:   payload.expectedWeek ?? null,
      expected_term:   payload.expectedTerm ?? null,
      curriculum_type: payload.curriculumType ?? '844',
      sort_order:      payload.sortOrder    ?? 0,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ── Get all topics for a subject / class level ────────────────────
export async function getSyllabusTopics(subject: string, classLevel?: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  let query = admin
    .from('syllabus_topics')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('subject', subject)
    .order('sort_order')
    .order('expected_week')

  if (classLevel) query = query.eq('class_level', classLevel)

  const { data, error } = await query
  if (error) throw new Error('Failed to fetch topics')
  return data ?? []
}

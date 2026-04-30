// POST /api/groups/rotate — rebuild groups from new exam results

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    group_id?: string
    new_exam_type?: string
  }

  if (!body.group_id) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  const db = createAdminSupabaseClient()

  // Fetch the existing group configuration
  const { data: existing } = await db
    .from('student_groups')
    .select('*')
    .eq('id', body.group_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // Extract all student IDs from current groups
  const currentGroups = existing.groups as Array<{
    group_number: number
    label: string
    students: Array<{ id: string; name: string; score: number | null }>
  }>
  const studentIds = currentGroups.flatMap(g => g.students.map((s: { id: string }) => s.id))

  // Fetch new scores
  const { data: marks } = await db
    .from('marks')
    .select('student_id, raw_score, total_marks')
    .in('student_id', studentIds)
    .order('recorded_at', { ascending: false })

  const scoreMap: Record<string, number[]> = {}
  for (const m of (marks ?? [])) {
    if (!scoreMap[m.student_id]) scoreMap[m.student_id] = []
    if (m.raw_score != null && m.total_marks > 0) {
      scoreMap[m.student_id].push(Math.round((m.raw_score / m.total_marks) * 100))
    }
  }

  // Re-sort all students by new scores
  const allStudents = currentGroups
    .flatMap(g => g.students)
    .map((s: { id: string; name: string }) => {
      const scores = scoreMap[s.id] ?? []
      return {
        id:    s.id,
        name:  s.name,
        score: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
      }
    })
    .sort((a, b) => (b.score ?? 50) - (a.score ?? 50))

  // Redistribute using same formation type
  const groupSize    = Math.ceil(allStudents.length / currentGroups.length)
  const formType     = existing.formation_type as string
  const rotationDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const labels       = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa']

  let newGroups: typeof currentGroups

  if (formType === 'homogeneous') {
    // Keep similar performers together
    newGroups = []
    for (let i = 0; i < currentGroups.length; i++) {
      const chunk = allStudents.slice(i * groupSize, (i + 1) * groupSize)
      if (!chunk.length) break
      newGroups.push({
        group_number: i + 1,
        label:        `Group ${labels[i] ?? i + 1}`,
        students:     chunk.map(s => ({ ...s, role: 'peer' })),
      })
    }
  } else {
    // Mixed: interleave top + bottom (snake draft)
    newGroups = Array.from({ length: currentGroups.length }, (_, i) => ({
      group_number: i + 1,
      label:        `Group ${labels[i] ?? i + 1}`,
      students:     [] as typeof allStudents,
    }))
    for (let i = 0; i < allStudents.length; i++) {
      const groupIdx = i % currentGroups.length
      newGroups[groupIdx].students.push(allStudents[i])
    }
  }

  // Save new rotation
  const { data: saved, error } = await db
    .from('student_groups')
    .insert({
      school_id:      existing.school_id,
      teacher_id:     existing.teacher_id,
      class_name:     existing.class_name,
      stream_name:    existing.stream_name,
      subject_name:   existing.subject_name,
      term:           existing.term,
      academic_year:  existing.academic_year,
      exam_type:      body.new_exam_type ?? existing.exam_type,
      groups:         newGroups,
      formation_type: formType,
      rotation_week:  (existing.rotation_week ?? 1) + 1,
      ai_rationale:   `Rotation ${(existing.rotation_week ?? 1) + 1} — rebuilt from updated scores`,
      expires_at:     rotationDate,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: saved, rotation_date: rotationDate })
}

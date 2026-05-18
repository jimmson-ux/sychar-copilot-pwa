// POST /api/groups/generate — Claude AI group formation

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set([
  'principal','deputy_principal','deputy_principal_academic','dean_of_studies',
  'class_teacher','subject_teacher',
  'hod_sciences','hod_arts','hod_languages','hod_mathematics',
  'hod_social_sciences','hod_technical','hod_pathways',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — subject teacher or above required' }, { status: 403 })
  }

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as {
    class_name?: string
    stream_name?: string
    subject_name?: string
    term?: number
    academic_year?: string
    exam_type?: string
    group_size?: number
    formation_type?: 'mixed' | 'homogeneous' | 'rotating'
  }

  const required = ['class_name', 'subject_name', 'academic_year']
  for (const f of required) {
    if (!body[f as keyof typeof body]) {
      return NextResponse.json({ error: `${f} is required` }, { status: 400 })
    }
  }

  const db           = createAdminSupabaseClient()
  const groupSize    = body.group_size    ?? 4
  const formationType = body.formation_type ?? 'mixed'

  // Fetch students in this class
  let studentQuery = db
    .from('students')
    .select('id, full_name, admission_no')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)

  if (body.stream_name) {
    studentQuery = studentQuery.eq('stream', body.stream_name)
  } else {
    studentQuery = studentQuery.eq('class_name', body.class_name!)
  }

  const { data: students } = await studentQuery

  if (!students?.length) {
    return NextResponse.json({ error: 'No students found for this class' }, { status: 404 })
  }

  // Fetch latest marks for subject (best-effort — may be empty)
  const studentIds = students.map((s: { id: string }) => s.id)

  const { data: marks } = await db
    .from('marks')
    .select('student_id, raw_score, total_marks, exam_type, term')
    .in('student_id', studentIds)
    .order('recorded_at', { ascending: false })

  // Average score per student for this subject
  const scoreMap: Record<string, number[]> = {}
  for (const m of (marks ?? [])) {
    if (!scoreMap[m.student_id]) scoreMap[m.student_id] = []
    if (m.raw_score != null && m.total_marks > 0) {
      scoreMap[m.student_id].push(Math.round((m.raw_score / m.total_marks) * 100))
    }
  }

  const studentsWithScores = students
    .map((s: { id: string; full_name: string; admission_no: string }) => {
      const scores = scoreMap[s.id] ?? []
      const avg    = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null
      return { id: s.id, name: s.full_name, score: avg }
    })
    .sort((a: { score: number | null }, b: { score: number | null }) =>
      (b.score ?? 50) - (a.score ?? 50)
    )

  const rotationDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  const prompt = `You are creating optimal student study groups for a Kenyan secondary school.

SUBJECT: ${body.subject_name}
CLASS: ${body.class_name}${body.stream_name ? ' ' + body.stream_name : ''}
GROUP SIZE: ${groupSize} students per group
FORMATION TYPE: ${formationType}
TOTAL STUDENTS: ${studentsWithScores.length}

STUDENT PERFORMANCE DATA (sorted high to low, score is % or null if no data):
${JSON.stringify(studentsWithScores, null, 2)}

${formationType === 'mixed' ? `
Create MIXED ability groups where each group ideally has:
- 1 high performer (top 25%): anchors the group, reinforces own learning by teaching
- 2 average performers (middle 50%): benefit from peer explanation
- 1 struggling student (bottom 25%): receives direct peer support

For students with null scores, distribute them evenly across groups.
ROTATION: After 2 weeks (${rotationDate}), rotate struggling students to new groups.
` : `
Create HOMOGENEOUS groups of similar performers:
- High groups (>70%): extension and challenge problems
- Middle groups (40-70%): consolidation and practice
- Support groups (<40%): foundational concepts and scaffolding
`}

For each group provide:
1. The specific students (name + score)
2. Clear rationale for this combination
3. Recommended focus area based on their scores
4. Suggested role for each student

Return ONLY valid JSON:
{
  "groups": [
    {
      "group_number": 1,
      "label": "Group Alpha",
      "students": [{"id": "...", "name": "...", "score": 75, "role": "anchor"}],
      "focus_area": "...",
      "rationale": "...",
      "rotation_date": "${rotationDate}"
    }
  ],
  "overall_strategy": "...",
  "teacher_tips": ["tip1", "tip2", "tip3"]
}`

  let aiResult: Record<string, unknown>

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!groqRes.ok) throw new Error(`Groq error ${groqRes.status}`)
    const groqData = await groqRes.json() as { choices?: { message: { content: string } }[] }
    const raw   = groqData.choices?.[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    aiResult    = match ? JSON.parse(match[0]) : { groups: [], overall_strategy: raw, teacher_tips: [] }
  } catch {
    return NextResponse.json({ error: 'AI generation failed' }, { status: 502 })
  }

  // Persist to student_groups
  const { data: staffRow } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  const { data: saved } = await db
    .from('student_groups')
    .insert({
      school_id:      auth.schoolId,
      teacher_id:     staffRow?.id,
      class_name:     body.class_name,
      stream_name:    body.stream_name ?? null,
      subject_name:   body.subject_name,
      term:           body.term ?? null,
      academic_year:  body.academic_year,
      exam_type:      body.exam_type ?? null,
      groups:         aiResult.groups ?? [],
      formation_type: formationType,
      ai_rationale:   aiResult.overall_strategy as string ?? null,
      expires_at:     rotationDate,
    })
    .select('id')
    .single()

  return NextResponse.json({
    id:               (saved as { id: string } | null)?.id ?? null,
    groups:           aiResult.groups,
    overall_strategy: aiResult.overall_strategy,
    teacher_tips:     aiResult.teacher_tips,
    rotation_date:    rotationDate,
  })
}

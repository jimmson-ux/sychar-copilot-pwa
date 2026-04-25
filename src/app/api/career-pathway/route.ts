// GET /api/career-pathway?student_id=<id> — KUCCPS course match + Claude narrative

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { detectCluster, matchCourses, gradeToPoints } from '@/lib/kuccps-data'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) {
    return NextResponse.json({ error: 'student_id required' }, { status: 400 })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 })
  }

  const db = svc()

  // Fetch student
  const { data: student, error: stuErr } = await db
    .from('students')
    .select('id, full_name, current_form, class_name, admission_number')
    .eq('id', studentId)
    .eq('school_id', auth.schoolId!)
    .single()

  if (stuErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  type StudentRow = { id: string; full_name: string; current_form: string | null; class_name: string | null; admission_number: string | null }
  const stu = student as StudentRow

  // Check cache (< 7 days old)
  const { data: cached } = await db
    .from('ai_career_reports')
    .select('*')
    .eq('student_id', studentId)
    .eq('school_id', auth.schoolId!)
    .gte('generated_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached) {
    return NextResponse.json({ report: cached, cached: true })
  }

  // Fetch latest marks (most recent term for each subject)
  const { data: marksRaw } = await db
    .from('marks')
    .select('subject_name, score, percentage, term')
    .eq('student_id', studentId)
    .eq('school_id', auth.schoolId!)
    .order('term', { ascending: false })

  type MarkRow = { subject_name: string; score: number; percentage: number | null; term: string }
  const marks = (marksRaw ?? []) as MarkRow[]

  // Take best score per subject (most recent term wins)
  const subjectMap: Record<string, number> = {}
  const seen = new Set<string>()
  for (const m of marks) {
    if (!seen.has(m.subject_name)) {
      seen.add(m.subject_name)
      subjectMap[m.subject_name] = m.percentage ?? m.score
    }
  }

  if (Object.keys(subjectMap).length === 0) {
    return NextResponse.json({ error: 'No marks found for this student' }, { status: 404 })
  }

  // Detect cluster and calculate cluster score
  const cluster = detectCluster(subjectMap)

  // Approximate cluster score: top 4 subject scores scaled to KUCCPS weight (max 12 per subject)
  const sortedScores = Object.values(subjectMap).sort((a, b) => b - a).slice(0, 4)
  const clusterScore = Math.round(sortedScores.reduce((s, v) => s + (v / 100) * 12, 0))

  const matchedCourses = matchCourses(clusterScore, cluster, 5)

  // Gap analysis: what score improvement needed per subject for top course
  const topCourse = matchedCourses[0]
  const gap = topCourse ? Math.max(0, topCourse.clusterA - clusterScore) : 0

  const gapAnalysis = {
    targetCourse: topCourse?.course ?? 'No qualifying courses found',
    currentScore: clusterScore,
    requiredScore: topCourse?.clusterA ?? 0,
    pointsNeeded: gap,
    weakSubjects: Object.entries(subjectMap)
      .filter(([, score]) => score < 60)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 3)
      .map(([subject, score]) => ({ subject, score, targetScore: 70 })),
  }

  // Claude narrative
  const subjectSummary = Object.entries(subjectMap)
    .map(([s, v]) => `${s}: ${v}%`)
    .join(', ')

  const topCoursesList = matchedCourses.map(c => `${c.course} (${c.institution})`).join(', ')

  const prompt = `Write a concise 120-word career pathway report for a Kenyan secondary school student.
Student: ${stu.full_name}, Form ${stu.current_form ?? '4'}, ${stu.class_name ?? 'Unknown class'}
Current performance: ${subjectSummary}
Identified cluster: ${cluster}
Top matching university courses: ${topCoursesList || 'Limited options at current grades'}
Points gap to top course: ${gap} cluster points

Be encouraging but realistic. Mention their strongest subjects, top course match, and one clear improvement action.
Write in second person ("Your performance..."). Plain text only, no headers.`

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'You are a Kenyan school career guidance counsellor. Write encouraging, realistic advice.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const claudeData = claudeRes.ok
    ? await claudeRes.json() as { content?: Array<{ text: string }> }
    : { content: [] }
  const narrative = claudeData.content?.[0]?.text ?? 'Career pathway analysis not available.'

  const report = {
    student_id:    studentId,
    school_id:     auth.schoolId,
    student_name:  stu.full_name,
    cluster,
    cluster_score: clusterScore,
    course_matches: matchedCourses,
    gap_analysis:   gapAnalysis,
    narrative,
    generated_at:   new Date().toISOString(),
  }

  // Cache in ai_career_reports
  await db.from('ai_career_reports').upsert({
    ...report,
  }, { onConflict: 'school_id,student_id' }).then(() => {}, () => {})

  return NextResponse.json({ report, cached: false })
}

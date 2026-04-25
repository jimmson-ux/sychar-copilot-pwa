// GET /api/parent/student/[studentId]/marks?term=1&year=2026
// Returns: latest exam marks per subject + term trend (avg by term)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

type MarkRow = {
  subject_id: string | null
  score: number | null
  percentage: number | null
  grade: string | null
  exam_type: string | null
  term: string | null
  academic_year: string | null
  created_at: string
  subjects?: { name: string } | { name: string }[] | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const { studentId } = await params

  if (!parent.studentIds.includes(studentId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const p    = req.nextUrl.searchParams
  const term = p.get('term') ?? '1'
  const year = p.get('year') ?? String(new Date().getFullYear())

  const svc = createAdminSupabaseClient()

  const [{ data: current }, { data: trend }] = await Promise.all([
    // Latest marks for requested term/year
    svc
      .from('marks')
      .select('subject_id, score, percentage, grade, exam_type, term, academic_year, created_at, subjects(name)')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .eq('term', term)
      .eq('academic_year', year)
      .order('created_at', { ascending: false }),

    // Term trend: last 6 terms mean score
    svc
      .from('marks')
      .select('term, academic_year, percentage')
      .eq('student_id', studentId)
      .eq('school_id', parent.schoolId)
      .not('percentage', 'is', null)
      .order('academic_year', { ascending: false })
      .order('term', { ascending: false })
      .limit(120),
  ])

  // Aggregate trend by (year, term)
  const trendMap = new Map<string, { sum: number; count: number }>()
  for (const r of (trend ?? []) as MarkRow[]) {
    const key = `${r.academic_year}-T${r.term}`
    const entry = trendMap.get(key) ?? { sum: 0, count: 0 }
    entry.sum   += Number(r.percentage ?? 0)
    entry.count += 1
    trendMap.set(key, entry)
  }

  const termTrend = Array.from(trendMap.entries())
    .map(([key, v]) => ({ period: key, avg: Math.round(v.sum / v.count) }))
    .slice(0, 6)

  const marks = (current ?? []).map((m: MarkRow) => {
    const subjectArr = m.subjects
    const subjectName = Array.isArray(subjectArr)
      ? (subjectArr[0] as { name: string })?.name
      : (subjectArr as { name: string } | null)?.name
    return {
      subject:    subjectName ?? null,
      score:      m.score,
      percentage: m.percentage,
      grade:      m.grade,
      examType:   m.exam_type,
    }
  })

  return NextResponse.json({ marks, termTrend })
}

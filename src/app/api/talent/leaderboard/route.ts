// GET /api/talent/leaderboard — overall + per-category leaderboard
// Public-intent but school-scoped. Used by Hall of Fame page.

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const CATEGORIES = [
  'Academic Excellence', 'Leadership & Character', 'Sports & Physical',
  'Arts & Culture', 'Innovation & Technical', 'School Citizenship',
]

export async function GET(req: NextRequest) {
  const db         = svc()
  const schoolCode = req.nextUrl.searchParams.get('school_code')
  const termId     = req.nextUrl.searchParams.get('term_id')
  const category   = req.nextUrl.searchParams.get('category')
  const studentId  = req.nextUrl.searchParams.get('student_id') // for "my profile"

  // Resolve school by code or id
  let schoolId = req.nextUrl.searchParams.get('school_id')
  if (!schoolId && schoolCode) {
    const { data: school } = await db
      .from('schools').select('id').eq('school_code', schoolCode).single()
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    schoolId = (school as { id: string }).id
  }
  if (!schoolId) return NextResponse.json({ error: 'school_code or school_id required' }, { status: 400 })

  let query = db
    .from('talent_points')
    .select('student_id, category, points, awarded_at, students(full_name, class_name, admission_number)')
    .eq('school_id', schoolId)
    .eq('status', 'approved')

  if (termId)    query = query.eq('term_id', termId)
  if (category)  query = query.eq('category', category)
  if (studentId) query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const rows = data as unknown as {
    student_id: string; category: string; points: number; awarded_at: string;
    students: { full_name: string; class_name: string; admission_number: string | null } | null;
  }[]

  // Aggregate totals per student
  type StudentAgg = {
    student_id: string; full_name: string; class_name: string;
    total_points: number; by_category: Record<string, number>;
    recent_recognition: string | null; recent_date: string | null;
  }
  const byStudent = new Map<string, StudentAgg>()

  for (const r of rows) {
    const s = r.students
    if (!byStudent.has(r.student_id)) {
      byStudent.set(r.student_id, {
        student_id: r.student_id,
        full_name:  s?.full_name ?? 'Unknown',
        class_name: s?.class_name ?? '',
        total_points: 0,
        by_category: {},
        recent_recognition: null,
        recent_date: null,
      })
    }
    const agg = byStudent.get(r.student_id)!
    agg.total_points += r.points
    agg.by_category[r.category] = (agg.by_category[r.category] ?? 0) + r.points
  }

  const overall = [...byStudent.values()]
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 50)
    .map((s, i) => ({ rank: i + 1, ...s }))

  // Per-category leaderboards (top 10 each)
  const perCategory: Record<string, unknown[]> = {}
  for (const cat of CATEGORIES) {
    perCategory[cat] = overall
      .filter(s => (s.by_category[cat] ?? 0) > 0)
      .sort((a, b) => (b.by_category[cat] ?? 0) - (a.by_category[cat] ?? 0))
      .slice(0, 10)
      .map((s, i) => ({ ...s, rank: i + 1, category_points: s.by_category[cat] ?? 0 }))
  }

  // Student profile (if requested)
  let studentProfile = null
  if (studentId && byStudent.has(studentId)) {
    const s     = byStudent.get(studentId)!
    const rank  = overall.findIndex(x => x.student_id === studentId) + 1
    // Class rank
    const classmates = overall.filter(x => x.class_name === s.class_name)
    const classRank  = classmates.findIndex(x => x.student_id === studentId) + 1

    // Recent recognitions
    const recent = rows
      .filter(r => r.student_id === studentId)
      .sort((a, b) => new Date(b.awarded_at).getTime() - new Date(a.awarded_at).getTime())
      .slice(0, 5)
      .map(r => ({ category: r.category, points: r.points, date: r.awarded_at }))

    studentProfile = { ...s, school_rank: rank, class_rank: classRank, recent_recognitions: recent }
  }

  return NextResponse.json({
    overall,
    per_category: perCategory,
    student_profile: studentProfile,
    categories: CATEGORIES,
    total_students_with_points: byStudent.size,
  })
}

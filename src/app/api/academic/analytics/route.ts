import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/academic/analytics?term=&year=&exam_type= — school-wide academic analytics:
 * overall mean, per-subject means, top/weakest subjects. Drives the Principal, Deputy
 * Academic and Dean of Studies dashboards (parent PWA uses subject_performance directly).
 * Leadership / dean / HOD only. School-scoped.
 */
const ALLOWED = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'dean_of_studies', 'qaso', 'quality_assurance_officer'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole) && !auth.subRole.startsWith('hod_')) {
    return NextResponse.json({ error: 'Leadership / dean / HOD only' }, { status: 403 })
  }
  const url = new URL(req.url)
  const term = url.searchParams.get('term')
  const year = url.searchParams.get('year')
  const examType = url.searchParams.get('exam_type')

  const svc = createAdminSupabaseClient()

  // School class ids (marks are scoped by class_id) + subject names/codes.
  const [{ data: classes }, { data: subjects }] = await Promise.all([
    svc.from('classes').select('id').eq('school_id', auth.schoolId),
    svc.from('subjects').select('id, name, code').eq('school_id', auth.schoolId),
  ])
  const classIds = (classes as { id: string }[] ?? []).map((c) => c.id)
  const subjMap = new Map((subjects as { id: string; name: string; code: string }[] ?? []).map((s) => [s.id, s]))
  if (classIds.length === 0) return NextResponse.json({ school_mean: null, subjects: [], top: [], weak: [], samples: 0 })

  let q = svc.from('marks').select('percentage, subject_id').in('class_id', classIds).not('percentage', 'is', null).limit(20000)
  if (term) q = q.eq('term', term)
  if (year) q = q.eq('academic_year', year)
  if (examType) q = q.eq('exam_type', examType)
  const { data: marks, error } = await q
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })

  const rows = (marks as { percentage: number; subject_id: string | null }[] ?? [])
  let sum = 0
  const bySubject = new Map<string, { sum: number; n: number }>()
  for (const m of rows) {
    const p = Number(m.percentage)
    sum += p
    if (m.subject_id) {
      const cur = bySubject.get(m.subject_id) ?? { sum: 0, n: 0 }
      cur.sum += p; cur.n += 1; bySubject.set(m.subject_id, cur)
    }
  }
  const schoolMean = rows.length ? Math.round((sum / rows.length) * 10) / 10 : null
  const subjectStats = [...bySubject.entries()].map(([id, v]) => ({
    subject_id: id,
    name: subjMap.get(id)?.name ?? 'Unknown',
    code: subjMap.get(id)?.code ?? null,
    mean: Math.round((v.sum / v.n) * 10) / 10,
    entries: v.n,
  })).sort((a, b) => b.mean - a.mean)

  return NextResponse.json({
    school_mean: schoolMean,
    samples: rows.length,
    filters: { term, year, exam_type: examType },
    subjects: subjectStats,
    top: subjectStats.slice(0, 5),
    weak: [...subjectStats].reverse().slice(0, 5),
  })
}

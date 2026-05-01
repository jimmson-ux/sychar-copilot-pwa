// GET /api/compliance/summary
// Returns per-teacher compliance scores for the current term.
// Principal and dean only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set([
  'principal', 'deputy_principal', 'deputy_principal_academics',
  'dean_of_studies', 'deputy_dean_of_studies', 'qaso',
])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = svc()
  const month = new Date().getMonth() + 1
  const term  = req.nextUrl.searchParams.get('term')
    ?? String(month <= 4 ? 1 : month <= 8 ? 2 : 3)
  const year  = req.nextUrl.searchParams.get('year')
    ?? String(new Date().getFullYear())

  const { data, error } = await db
    .from('staff_records')
    .select(`
      id,
      full_name,
      subject_specialization,
      department,
      document_compliance!teacher_id (
        compliance_score,
        scheme_submitted,
        lesson_plan_submitted,
        record_of_work_current,
        term,
        academic_year
      )
    `)
    .eq('school_id', auth.schoolId!)
    .eq('is_active', true)
    .in('sub_role', [
      'class_teacher', 'subject_teacher', 'form_teacher',
      'form_principal_form4', 'form_principal_grade10',
      'hod_sciences', 'hod_mathematics', 'hod_languages',
      'hod_humanities', 'hod_applied_sciences', 'hod_games_sports',
      'dean_of_studies', 'deputy_dean_of_studies',
      'teacher', 'senior_teacher', 'hod', 'deputy_hod',
    ])
    .order('full_name')

  if (error) {
    console.error('[compliance/summary]', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const teachers = (data ?? []).map(row => {
    const comp = (row.document_compliance as {
      compliance_score: number | null
      scheme_submitted: boolean | null
      lesson_plan_submitted: boolean | null
      record_of_work_current: boolean | null
      term: number
      academic_year: string
    }[] | null)?.find(
      c => String(c.term) === term && c.academic_year === year
    )

    const score = comp?.compliance_score ?? 0
    return {
      teacher_id:              row.id,
      full_name:               row.full_name,
      subject_specialization:  row.subject_specialization,
      department:              row.department,
      compliance_score:        score,
      scheme_submitted:        comp?.scheme_submitted ?? false,
      lesson_plan_submitted:   comp?.lesson_plan_submitted ?? false,
      record_of_work_current:  comp?.record_of_work_current ?? false,
      traffic_light:           score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red',
    }
  })

  const green  = teachers.filter(t => t.traffic_light === 'green').length
  const amber  = teachers.filter(t => t.traffic_light === 'amber').length
  const red    = teachers.filter(t => t.traffic_light === 'red').length

  return NextResponse.json({
    teachers,
    summary: { green, amber, red, total: teachers.length },
    term,
    year,
  })
}

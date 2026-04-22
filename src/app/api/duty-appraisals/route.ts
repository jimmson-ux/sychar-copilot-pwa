import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { corsHeaders, handleCors } from '@/lib/cors'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function OPTIONS(req: Request) {
  return handleCors(req) || new Response(null, { status: 204 })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(ip, LIMITS.API_GENERAL.max, LIMITS.API_GENERAL.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: corsHeaders(origin) })

  const supabase = getClient()
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { data: appraisals, error } = await supabase
    .from('appraisals')
    .select('id, duty_date, punctuality, incident_handling, report_quality, student_welfare, overall_rating, duty_notes, graded_via, appraisee_id')
    .eq('appraisal_type', 'duty')
    .eq('school_id', auth.schoolId) // scoped to verified school
    .order('duty_date', { ascending: false })

  if (error) {
    console.error('[duty-appraisals] query error:', error.message)
    return NextResponse.json({ error: 'Failed to load appraisals' }, { status: 500 })
  }

  if (!appraisals || appraisals.length === 0) {
    return NextResponse.json({ summary: [] })
  }

  const teacherIds = [...new Set(appraisals.map(a => a.appraisee_id))]
  const { data: staff } = await supabase
    .from('staff_records')
    .select('id, full_name, sub_role')
    .in('id', teacherIds)
    .eq('school_id', auth.schoolId) // never return staff from other schools

  const staffMap = new Map((staff || []).map(s => [s.id, s]))

  const teacherMap = new Map<string, {
    teacher_id: string
    teacher_name: string
    sub_role: string
    grades: {
      id: string
      duty_date: string
      punctuality: number
      incident_handling: number
      report_quality: number
      student_welfare: number
      duty_overall: number
      overall_rating: string
      duty_notes: string
      graded_via: string
      staff_records: { full_name: string; sub_role: string } | null
    }[]
  }>()

  for (const row of appraisals) {
    const sr = staffMap.get(row.appraisee_id)
    if (!teacherMap.has(row.appraisee_id)) {
      teacherMap.set(row.appraisee_id, {
        teacher_id:   row.appraisee_id,
        teacher_name: sr?.full_name || 'Unknown',
        sub_role:     sr?.sub_role  || '',
        grades: [],
      })
    }
    const dutyOverall = Math.round(
      (row.punctuality + row.incident_handling + row.report_quality + row.student_welfare) / 4
    )
    teacherMap.get(row.appraisee_id)!.grades.push({
      id:               row.id,
      duty_date:        row.duty_date,
      punctuality:      row.punctuality,
      incident_handling: row.incident_handling,
      report_quality:   row.report_quality,
      student_welfare:  row.student_welfare,
      duty_overall:     dutyOverall,
      overall_rating:   row.overall_rating,
      duty_notes:       row.duty_notes,
      graded_via:       row.graded_via,
      staff_records:    sr ?? null,
    })
  }

  const summary = Array.from(teacherMap.values()).map(t => {
    const g = t.grades
    const n = g.length
    const avg = (field: string) =>
      Math.round((g.reduce((sum, r) => sum + ((r as unknown as Record<string, number>)[field] ?? 0), 0) / n) * 10) / 10

    return {
      teacher_id:      t.teacher_id,
      teacher_name:    t.teacher_name,
      sub_role:        t.sub_role,
      avg_punctuality: avg('punctuality'),
      avg_incident:    avg('incident_handling'),
      avg_report:      avg('report_quality'),
      avg_welfare:     avg('student_welfare'),
      avg_overall:     avg('duty_overall'),
      total_duties:    n,
      last_graded:     g[0]?.duty_date ?? '',
      grades:          g,
    }
  }).sort((a, b) => b.avg_overall - a.avg_overall)

  return NextResponse.json({ summary })
}

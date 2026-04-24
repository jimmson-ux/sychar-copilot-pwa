// POST /api/compliance/remind — principal + dean
// SMS-reminds selected teachers about overdue compliance items.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendSMS } from '@/lib/sms'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set([
  'principal', 'dean_of_studies', 'deputy_principal_academics', 'deputy_principal',
])

type TeacherRow = { id: string; full_name: string; phone_number: string | null }
type CompRow    = {
  teacher_id: string
  scheme_submitted: boolean
  lesson_plan_submitted: boolean
  record_of_work_current: boolean
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: principal or dean only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    teacherIds:   string[]
    term?:        string
    academicYear?: string
  } | null

  if (!body?.teacherIds?.length) {
    return NextResponse.json({ error: 'teacherIds array required' }, { status: 400 })
  }

  const month = new Date().getMonth() + 1
  const term  = body.term ?? String(month <= 4 ? 1 : month <= 8 ? 2 : 3)
  const year  = body.academicYear ?? String(new Date().getFullYear())
  const now   = new Date().toISOString()

  const db = svc()

  const { data: teachers } = await db
    .from('staff_records')
    .select('id, full_name, phone_number')
    .eq('school_id', auth.schoolId!)
    .in('id', body.teacherIds)

  const teacherMap = Object.fromEntries(
    ((teachers ?? []) as TeacherRow[]).map(t => [t.id, t])
  )

  const { data: compRows } = await db
    .from('document_compliance')
    .select('teacher_id, scheme_submitted, lesson_plan_submitted, record_of_work_current')
    .in('teacher_id', body.teacherIds)
    .eq('term', Number(term))
    .eq('academic_year', year)

  const compMap = Object.fromEntries(
    ((compRows ?? []) as CompRow[]).map(c => [c.teacher_id, c])
  )

  const results: { teacherId: string; smsSent: boolean; missingItems: string[] }[] = []

  for (const teacherId of body.teacherIds) {
    const teacher = teacherMap[teacherId]
    const comp    = compMap[teacherId]

    if (!teacher) {
      results.push({ teacherId, smsSent: false, missingItems: [] })
      continue
    }

    const missing: string[] = []
    if (!comp?.scheme_submitted)       missing.push('Scheme of Work')
    if (!comp?.lesson_plan_submitted)  missing.push('Lesson Plans')
    if (!comp?.record_of_work_current) missing.push('Record of Work')

    let smsSent = false
    if (missing.length > 0 && teacher.phone_number) {
      const msg = `Sychar Compliance [Term ${term}/${year}]: Your ${missing.join(', ')} submission is overdue. Please submit via the staff portal or contact your HOD for assistance.`
      smsSent = await sendSMS(teacher.phone_number, msg)
    }

    // Update last_reminded_at regardless
    await db.from('document_compliance').upsert({
      school_id:       auth.schoolId,
      teacher_id:      teacherId,
      term:            Number(term),
      academic_year:   year,
      last_reminded_at: now,
    }, { onConflict: 'teacher_id,term,academic_year' })

    results.push({ teacherId, smsSent, missingItems: missing })
  }

  return NextResponse.json({
    ok:       true,
    reminded: results.filter(r => r.smsSent).length,
    results,
  })
}

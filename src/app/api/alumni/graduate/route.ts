// POST /api/alumni/graduate — graduate a student: sets status, creates alumni record, WhatsApps student

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'
import { sendWhatsApp }            from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:       string
    graduation_year:  number
    kcse_grade?:      string
    career_pathway?:  string  // from G&C tracker
  }

  if (!body.student_id || !body.graduation_year) {
    return NextResponse.json({ error: 'student_id and graduation_year required' }, { status: 400 })
  }

  // Fetch student + their achievements
  const { data: student } = await db
    .from('students')
    .select('id, full_name, admission_number, class_name, parent_phone, date_of_birth')
    .eq('id', body.student_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const s = student as {
    id: string; full_name: string; admission_number: string | null;
    class_name: string; parent_phone: string | null;
  }

  // Prevent double-graduation
  const { data: existingAlumni } = await db
    .from('alumni')
    .select('id')
    .eq('student_id', body.student_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (existingAlumni) {
    return NextResponse.json({ error: 'Student already graduated', alumni_id: (existingAlumni as { id: string }).id }, { status: 409 })
  }

  // Auto-compile achievements from system records
  const [suspRes, talentRes, attendRes] = await Promise.all([
    db.from('suspension_records').select('id').eq('student_id', body.student_id).eq('school_id', auth.schoolId!),
    db.from('talent_points').select('category, points, reason').eq('student_id', body.student_id).eq('school_id', auth.schoolId!).eq('status', 'approved').order('points', { ascending: false }).limit(10),
    db.from('attendance_records').select('status').eq('student_id', body.student_id).eq('school_id', auth.schoolId!),
  ])

  const suspCount  = suspRes.data?.length ?? 0
  const topPoints  = (talentRes.data ?? []) as { category: string; points: number; reason: string }[]
  const attRecords = (attendRes.data ?? []) as { status: string }[]
  const attPct     = attRecords.length > 0
    ? Math.round(attRecords.filter(r => r.status === 'present').length / attRecords.length * 100)
    : null

  const achievements = {
    top_talent_points: topPoints.slice(0, 5),
    attendance_rate:   attPct,
    suspensions:       suspCount,
    kcse_grade:        body.kcse_grade ?? null,
  }

  // ── Set student status = graduated ───────────────────────────────────────
  await db.from('students').update({ status: 'graduated' }).eq('id', body.student_id)

  // ── Create alumni record (student_id UUID preserved) ─────────────────────
  const { data: alumniRecord, error: alumniErr } = await db
    .from('alumni')
    .insert({
      school_id:        auth.schoolId,
      student_id:       body.student_id,  // original UUID preserved — never reassigned
      admission_number: s.admission_number,
      full_name:        s.full_name,
      graduation_year:  body.graduation_year,
      kcse_grade:       body.kcse_grade   ?? null,
      class_name:       s.class_name,
      achievements:     achievements,
      career_pathway:   body.career_pathway ?? null,
      whatsapp_number:  s.parent_phone,  // use parent number until student registers own
    })
    .select('id')
    .single()

  if (alumniErr) return NextResponse.json({ error: alumniErr.message }, { status: 500 })

  const { data: school } = await db.from('schools').select('name, school_code').eq('id', auth.schoolId!).single()
  const schoolName = (school as { name: string; school_code: string } | null)?.name ?? 'Your School'
  const schoolCode = (school as { name: string; school_code: string } | null)?.school_code ?? ''

  // ── WhatsApp congratulations ──────────────────────────────────────────────
  if (s.parent_phone) {
    const msg = `🎓 *Congratulations, ${s.full_name}!*\n\nOn behalf of ${schoolName}, we celebrate your graduation and wish you all the best as you begin the next chapter of your journey.\n\nYou are now part of our proud alumni community! Stay connected:\n\nReply *ALUMNI ${schoolCode}* to this number to update your contact details and join the mentorship network.\n\n_${schoolName}_`
    await sendWhatsApp(s.parent_phone, msg)
  }

  return NextResponse.json({
    ok:         true,
    alumni_id:  (alumniRecord as { id: string }).id,
    full_name:  s.full_name,
    achievements,
  })
}

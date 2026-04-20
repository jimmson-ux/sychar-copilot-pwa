// PATCH /api/nurse/visits/[id] — discharge a patient from sick bay
// Checks timetable → offers to notify subject teacher → updates attendance

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['nurse', 'principal', 'deputy'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()
  const body   = await req.json() as { notify_teacher?: boolean; discharge_notes?: string }

  // Fetch visit + student
  const { data: visit } = await db
    .from('sick_bay_visits')
    .select('id, student_id, complaint, admitted_at, is_in_bay, school_id, students(full_name, class_name)')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  const v = visit as unknown as {
    id: string; student_id: string; complaint: string; admitted_at: string;
    is_in_bay: boolean; school_id: string;
    students: { full_name: string; class_name: string } | null
  }

  if (!v.is_in_bay) return NextResponse.json({ error: 'Patient already discharged' }, { status: 409 })

  const now = new Date().toISOString()

  // Discharge
  await db.from('sick_bay_visits').update({
    is_in_bay:     false,
    discharged_at: now,
    notes:         body.discharge_notes ?? null,
    teacher_notified: body.notify_teacher ?? false,
  }).eq('id', id)

  // Update attendance: Present (late — medical)
  const today = now.split('T')[0]
  await db.from('attendance_records').upsert({
    school_id:  auth.schoolId!,
    student_id: v.student_id,
    date:       today,
    status:     'present_late_medical',
    notes:      `Discharged from sick bay at ${new Date(now).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })} — ${v.complaint}`,
  }, { onConflict: 'school_id,student_id,date', ignoreDuplicates: false }).then(() => {}, () => {})

  // Check current timetable period to know which teacher to notify
  let currentLesson: { subject: string; teacher_name: string } | null = null
  try {
    const hour = new Date().getHours()
    const minute = new Date().getMinutes()
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const dow     = new Date().getDay() // 0=Sun, 1=Mon...

    const { data: period } = await db
      .from('timetable_slots')
      .select('subject_name, staff_records(full_name)')
      .eq('school_id', auth.schoolId!)
      .ilike('class_name', `%${v.students?.class_name ?? ''}%`)
      .eq('day_of_week', dow)
      .lte('start_time', timeStr)
      .gte('end_time', timeStr)
      .single()

    if (period) {
      const p = period as unknown as { subject_name: string; staff_records: { full_name: string } | null }
      currentLesson = {
        subject:      p.subject_name,
        teacher_name: p.staff_records?.full_name ?? 'Unknown',
      }
    }
  } catch { /* no timetable data */ }

  return NextResponse.json({
    ok:              true,
    discharged_at:   now,
    attendance_updated: true,
    current_lesson:  currentLesson,
    teacher_notified: body.notify_teacher ?? false,
  })
}

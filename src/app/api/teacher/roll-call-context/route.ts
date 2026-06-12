import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { teacherCurrentLesson } from '@/lib/lessonContext'

export const dynamic = 'force-dynamic'

/**
 * GET /api/teacher/roll-call-context?class_name=Grade%2010A
 *
 * When the subject teacher takes lesson attendance, this returns students who are
 * absent WITH A VALID REASON — currently at the sick bay, or on an approved exeat —
 * so an absence in the roll call is explained (and serves as a defense). If
 * class_name is omitted, the teacher's currently-scheduled class is used.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const svc = createAdminSupabaseClient()
  const url = new URL(req.url)
  let className = url.searchParams.get('class_name') ?? undefined

  // Default to the teacher's current scheduled class.
  if (!className) {
    const { data: teacher } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()
    if (teacher) {
      const slot = await teacherCurrentLesson(svc, auth.schoolId, (teacher as { id: string }).id)
      className = slot?.class_name ?? undefined
    }
  }
  if (!className) {
    return NextResponse.json({ class_name: null, absent_with_reason: [], note: 'No current lesson/class resolved.' })
  }

  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const todayStart = `${today}T00:00:00Z`

  // Students in this class.
  const { data: classStudents } = await svc
    .from('students')
    .select('id, full_name, admission_number')
    .eq('school_id', auth.schoolId)
    .eq('class_name', className)
  const studentIds = new Set((classStudents as any[] ?? []).map((s) => s.id))
  const infoById = new Map((classStudents as any[] ?? []).map((s) => [s.id, s]))
  if (!studentIds.size) return NextResponse.json({ class_name: className, absent_with_reason: [] })

  // At sick bay today (in bay, or still in an open visit).
  const { data: visits } = await svc
    .from('sick_bay_visits')
    .select('student_id, complaint, is_in_bay, discharged_at, admitted_at')
    .eq('school_id', auth.schoolId)
    .gte('admitted_at', todayStart)
  const atNurse = new Map<string, string>()
  for (const v of (visits as any[] ?? [])) {
    if (!studentIds.has(v.student_id)) continue
    if (v.is_in_bay || !v.discharged_at) atNurse.set(v.student_id, v.complaint)
  }

  // Approved exeat covering today.
  const { data: exeats } = await svc
    .from('exeat_requests')
    .select('student_id, reason, leave_date, return_date')
    .eq('school_id', auth.schoolId)
    .eq('status', 'approved')
    .lte('leave_date', today)
    .gte('return_date', today)
  const onExeat = new Map<string, string>()
  for (const e of (exeats as any[] ?? [])) {
    if (studentIds.has(e.student_id)) onExeat.set(e.student_id, e.reason)
  }

  const absent: any[] = []
  for (const sid of studentIds) {
    const info = infoById.get(sid)
    if (atNurse.has(sid)) {
      absent.push({ student_id: sid, full_name: info?.full_name, admission_number: info?.admission_number, source: 'sick_bay', reason: `At sick bay: ${atNurse.get(sid)}` })
    } else if (onExeat.has(sid)) {
      absent.push({ student_id: sid, full_name: info?.full_name, admission_number: info?.admission_number, source: 'exeat', reason: `On approved exeat: ${onExeat.get(sid)}` })
    }
  }

  return NextResponse.json({ class_name: className, absent_with_reason: absent, count: absent.length })
}

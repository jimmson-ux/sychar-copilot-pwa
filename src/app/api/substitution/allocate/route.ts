import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/substitution/allocate
 *
 * When a teacher is absent, scan their lessons for the day and assign a relief
 * teacher: a same-department peer who is FREE at that slot. Attach the absent
 * teacher's next planned topic and push the substitute a data-rich notification.
 *
 * Body: { absent_teacher_id, date: 'YYYY-MM-DD' }
 * Leadership / dean only.
 */
const ADMIN_ROLES = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'dean_of_studies', 'super_admin'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ADMIN_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Only leadership can allocate substitutions.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { absent_teacher_id?: string; date?: string }
  if (!body.absent_teacher_id || !body.date) {
    return NextResponse.json({ error: 'absent_teacher_id and date required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()
  const dow = isoDow(body.date)

  const { data: caller } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()

  // Absent teacher's department + lessons that day.
  const { data: absent } = await svc.from('staff_records').select('id, full_name, department').eq('id', body.absent_teacher_id).eq('school_id', auth.schoolId).maybeSingle()
  if (!absent) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
  const dept = (absent as any).department as string | null

  const { data: lessons } = await svc
    .from('timetable_periods')
    .select('id, subject, class_name, start_time, end_time, period_number')
    .eq('school_id', auth.schoolId)
    .eq('teacher_id', body.absent_teacher_id)
    .eq('day_of_week', dow)
    .eq('period_type', 'lesson')
    .order('period_number')

  if (!lessons?.length) return NextResponse.json({ ok: true, assignments: [], note: 'No lessons for this teacher that day.' })

  // Candidate peers: same department (fallback any teacher).
  let peersQ = svc.from('staff_records').select('id, full_name').eq('school_id', auth.schoolId).neq('id', body.absent_teacher_id).eq('is_active', true)
  if (dept) peersQ = peersQ.eq('department', dept)
  const { data: peers } = await peersQ
  const peerIds = (peers as any[] ?? []).map((p) => p.id)
  const peerName = new Map((peers as any[] ?? []).map((p) => [p.id, p.full_name]))

  // Peers' busy slots that day.
  const { data: peerPeriods } = peerIds.length
    ? await svc.from('timetable_periods').select('teacher_id, start_time, end_time')
        .eq('school_id', auth.schoolId).eq('day_of_week', dow).in('teacher_id', peerIds)
    : { data: [] as any[] }
  const busy = new Map<string, { start: string; end: string }[]>()
  for (const p of (peerPeriods as any[] ?? [])) {
    if (!busy.has(p.teacher_id)) busy.set(p.teacher_id, [])
    busy.get(p.teacher_id)!.push({ start: p.start_time, end: p.end_time })
  }
  const isFree = (tid: string, start: string, end: string) =>
    !(busy.get(tid) ?? []).some((b) => overlaps(b.start, b.end, start, end))

  const assignments: any[] = []
  const usedThisRun = new Set<string>()

  for (const lesson of lessons as any[]) {
    // Next planned topic for this class+subject.
    const { data: plan } = await svc
      .from('lesson_plans')
      .select('cbc_sub_strand, cbc_strand, slo_cognitive, instructional_obj_1')
      .eq('school_id', auth.schoolId)
      .eq('class_name', lesson.class_name)
      .eq('subject_name', lesson.subject)
      .order('date_taught', { ascending: false })
      .limit(1)
      .maybeSingle()
    const topic = (plan as any)?.cbc_strand ?? null
    const subTopic = (plan as any)?.cbc_sub_strand ?? null
    const outcomes = (plan as any)?.slo_cognitive ?? (plan as any)?.instructional_obj_1 ?? null

    const sub = peerIds.find((tid) => isFree(tid, lesson.start_time, lesson.end_time) && !usedThisRun.has(`${tid}:${lesson.start_time}`))
    if (sub) usedThisRun.add(`${sub}:${lesson.start_time}`)

    const { data: row } = await svc.from('substitution_assignments').insert({
      school_id: auth.schoolId,
      absent_teacher_id: body.absent_teacher_id,
      substitute_teacher_id: sub ?? null,
      timetable_period_id: lesson.id,
      duty_date: body.date,
      subject: lesson.subject,
      class_name: lesson.class_name,
      topic, sub_topic: subTopic, outcomes,
      status: sub ? 'assigned' : 'unassigned',
      created_by: (caller as { id: string } | null)?.id ?? null,
    }).select('id').single()

    assignments.push({ period_id: lesson.id, subject: lesson.subject, class_name: lesson.class_name, substitute_teacher_id: sub ?? null, substitute_name: sub ? peerName.get(sub) : null, status: sub ? 'assigned' : 'unassigned', topic })

    // Push the substitute a data-rich relief notification.
    if (sub) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          audience: 'staff', value: sub, school_id: auth.schoolId,
          payload: {
            title: `Relief lesson: ${lesson.subject} ${lesson.class_name}`,
            body: `Cover ${lesson.start_time?.slice(0, 5)}–${lesson.end_time?.slice(0, 5)} for ${(absent as any).full_name}.` +
                  `${subTopic ? ` Topic: ${subTopic}.` : ''}`,
            url: '/dashboard/teacher', tag: 'substitution', renotify: true,
          },
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, absent_teacher: (absent as any).full_name, department: dept, assignments })
}

function isoDow(date: string): number {
  const d = new Date(`${date}T00:00:00Z`)
  const js = d.getUTCDay()
  return js === 0 ? 7 : js
}
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

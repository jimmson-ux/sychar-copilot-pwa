// POST /api/timetable/override  — deputy creates a live schedule override
// GET  /api/timetable/override  — fetch today's active overrides
// DELETE /api/timetable/override?id=<uuid> — cancel an override

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const DEPUTY_ROLES = [
  'deputy_principal', 'deputy_principal_academic', 'dean_of_studies',
  'principal', 'super_admin',
]

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const admin = getAdmin()
  const url   = new URL(req.url)
  const date  = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const { data, error } = await admin
    .from('active_schedule_overrides')
    .select(`
      id, original_lesson_id, override_date, new_teacher_id, new_room,
      override_reason, is_active, created_at, created_by,
      timetable_periods!original_lesson_id (
        class_name, subject, period_number, start_time, end_time, room,
        teacher_id, teacher_name
      ),
      staff_records!new_teacher_id ( full_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('override_date', date)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[override GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch overrides' }, { status: 500 })
  }

  return NextResponse.json({ overrides: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!DEPUTY_ROLES.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { original_lesson_id, new_teacher_id, new_room, override_reason, override_date } = body as {
    original_lesson_id: string
    new_teacher_id?:    string
    new_room?:          string
    override_reason?:   string
    override_date?:     string
  }

  if (!original_lesson_id) {
    return NextResponse.json({ error: 'original_lesson_id required' }, { status: 400 })
  }

  const admin = getAdmin()

  // Verify the lesson belongs to this school
  const { data: lesson } = await admin
    .from('timetable_periods')
    .select('id, teacher_id, teacher_name, class_name, subject')
    .eq('id', original_lesson_id)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  // Resolve creator staff record
  const { data: staff } = await admin
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  const today = override_date ?? new Date().toISOString().slice(0, 10)

  const { data: override, error } = await admin
    .from('active_schedule_overrides')
    .upsert(
      {
        school_id:          auth.schoolId,
        original_lesson_id,
        override_date:      today,
        new_teacher_id:     new_teacher_id ?? null,
        new_room:           new_room ?? null,
        override_reason:    override_reason ?? null,
        created_by:         staff?.id ?? null,
        is_active:          true,
      },
      { onConflict: 'original_lesson_id,override_date' }
    )
    .select()
    .single()

  if (error) {
    console.error('[override POST] error:', error)
    return NextResponse.json({ error: 'Failed to create override' }, { status: 500 })
  }

  // If new teacher assigned, send them a push notification
  if (new_teacher_id) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('school_id', auth.schoolId)
      .eq('staff_id', new_teacher_id)

    if (subs?.length) {
      try {
        const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
        if (VAPID_PUBLIC && VAPID_PRIVATE) {
          const webpush = (await import('web-push')).default
          webpush.setVapidDetails(
            process.env.VAPID_SUBJECT ?? 'mailto:admin@sychar.app',
            VAPID_PUBLIC,
            VAPID_PRIVATE,
          )
          const payload = JSON.stringify({
            title: 'Cover Assignment',
            body:  `You are covering ${lesson.subject} — ${lesson.class_name}`,
            url:   '/dashboard/timetable',
            tag:   `cover-${original_lesson_id}`,
          })
          await Promise.allSettled(
            subs.map((s) =>
              webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
              )
            )
          )
        }
      } catch {
        // Push failure must not block override creation
      }
    }
  }

  return NextResponse.json({ override })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!DEPUTY_ROLES.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const id  = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = getAdmin()

  const { error } = await admin
    .from('active_schedule_overrides')
    .update({ is_active: false })
    .eq('id', id)
    .eq('school_id', auth.schoolId)

  if (error) {
    console.error('[override DELETE] error:', error)
    return NextResponse.json({ error: 'Failed to cancel override' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET /api/cron/attendance-prealert — Vercel cron (~07:45 EAT on reporting days).
// For each school that opted in (tenant_configs.settings.attendance_prealert = true),
// find biometric-enrolled students who have NOT clocked IN today and push their
// parents a high-priority "not scanned yet" alert. Opt-in gating prevents noise
// on non-reporting days / holidays.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function pushParent(school_id: string, student_id: string, name: string) {
  const secret = process.env.STAFF_JWT_SECRET
  if (!secret) return
  const wazazi = process.env.WAZAZI_BASE_URL ?? 'https://wazazi.sychar.co.ke'
  await fetch(`${wazazi}/api/internal/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      school_id,
      student_ids: [student_id],
      title: '⚠️ Sychar • Gate Check',
      body: `${name} has not scanned in through the gate yet this morning. Please contact the school if they are absent today.`,
      type: 'attendance',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `prealert-${student_id}-${new Date().toISOString().slice(0, 10)}`,
      url: `/attendance?studentId=${student_id}`,
      data: { url: `/attendance?studentId=${student_id}`, prealert: true },
    }),
  }).catch(() => {})
}

export async function GET(req: NextRequest) {
  // Vercel cron auth (or manual ?key=) — never run open.
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? req.nextUrl.searchParams.get('key') ?? ''
  if (!secret || provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = svc()
  const dayStart = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })).toISOString().slice(0, 10) + 'T00:00:00Z'

  // Schools that opted in to the morning pre-alert.
  const { data: tenants } = await db.from('tenant_configs').select('school_id, settings')
  const optedIn = (tenants ?? []).filter((t: any) => t?.settings?.attendance_prealert === true).map((t: any) => t.school_id)
  if (!optedIn.length) return NextResponse.json({ ok: true, schools: 0, alerted: 0 })

  let alerted = 0
  for (const school_id of optedIn) {
    const { data: enr } = await db.from('biometric_enrollments')
      .select('student_id').eq('school_id', school_id).eq('subject_type', 'student').not('student_id', 'is', null)
    const enrolledIds = [...new Set((enr ?? []).map((r: any) => r.student_id))]
    if (!enrolledIds.length) continue

    const { data: ins } = await db.from('attendance_events')
      .select('student_id').eq('school_id', school_id).eq('direction', 'in').gte('event_at', dayStart)
    const checkedIn = new Set((ins ?? []).map((r: any) => r.student_id))

    const missing = enrolledIds.filter((id) => !checkedIn.has(id))
    if (!missing.length) continue

    const { data: studs } = await db.from('students').select('id, full_name').in('id', missing).eq('is_active', true)
    for (const s of (studs ?? []) as any[]) {
      await pushParent(school_id, s.id, s.full_name ?? 'Your child')
      alerted++
    }
  }
  return NextResponse.json({ ok: true, schools: optedIn.length, alerted })
}

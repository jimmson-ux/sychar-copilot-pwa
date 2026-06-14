// GET /api/cron/exeat-escalation — tiered escalation for overdue exeat returns.
// Schedule: */15 * * * * (every 15 min). Boarding/biometric schools.
//   Tier 1 (>=30 min overdue): Teacher-on-Duty + class teacher + deputy
//   Tier 2 (>=2 h):            deputy principal (admin)
//   Tier 3 (>=12 h):           principal + parent (WhatsApp)
// escalation_level on the exeat row stops a tier re-firing. expected_return_at defaults
// to return_date 18:00 EAT when not explicitly set.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { sendWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const TIERS = [
  { level: 1, minutes: 30, roles: ['teacher_on_duty', 'tod', 'deputy_principal', 'deputy_principal_admin'] },
  { level: 2, minutes: 120, roles: ['deputy_principal', 'deputy_principal_admin'] },
  { level: 3, minutes: 720, roles: ['principal'] },
]

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = svc()
  const now = Date.now()
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Approved exeats that have NOT returned yet, not fully escalated.
  const { data: open } = await db.from('exeat_requests')
    .select('id, school_id, student_id, return_date, expected_return_at, escalation_level, destination, students!student_id(full_name, class_name, class_id, parent_phone)')
    .eq('status', 'approved').is('return_time', null).lt('escalation_level', 3)
    .limit(500)

  let escalated = 0
  for (const x of (open ?? []) as any[]) {
    const stu = Array.isArray(x.students) ? x.students[0] : x.students
    if (!stu) continue

    // Expected return: explicit timestamp, else return_date at 18:00 EAT (15:00 UTC).
    const expected = x.expected_return_at
      ? new Date(x.expected_return_at).getTime()
      : (x.return_date ? new Date(`${x.return_date}T15:00:00Z`).getTime() : NaN)
    if (isNaN(expected) || now < expected) continue
    const minsOverdue = Math.round((now - expected) / 60000)

    // Highest tier whose threshold is met and not yet fired.
    const tier = [...TIERS].reverse().find((t) => minsOverdue >= t.minutes && x.escalation_level < t.level)
    if (!tier) continue

    const name = stu.full_name ?? 'A student'
    const cls = stu.class_name ?? ''
    const hrs = (minsOverdue / 60).toFixed(1)

    // Resolve target staff: tier roles + (tier 1) the class teacher.
    const staffIds = new Set<string>()
    if (tier.level === 1 && stu.class_id) {
      const { data: ct } = await db.from('staff_records').select('id').eq('school_id', x.school_id).eq('assigned_class', stu.class_id).eq('is_active', true)
      for (const r of (ct ?? []) as { id: string }[]) staffIds.add(r.id)
    }

    db.from('alerts').insert({
      school_id: x.school_id, type: 'exeat_overdue', severity: tier.level >= 2 ? 'high' : 'medium',
      title: `OVERDUE RETURN (tier ${tier.level}): ${name} (${cls}) — ${hrs} h late from ${x.destination ?? 'exeat'}`,
      detail: { exeat_id: x.id, student_id: x.student_id, minutes_overdue: minsOverdue, tier: tier.level },
    }).then(() => {}, () => {})

    const payload = {
      title: `⏰ Overdue return — tier ${tier.level}`,
      body: `${name} (${cls}) is ${hrs} h late returning from ${x.destination ?? 'exeat'}.`,
      url: '/dashboard/gate', tag: `exeat-overdue-${x.id}-${tier.level}`, renotify: true,
    }
    fetch(`${base}/functions/v1/send-push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ school_id: x.school_id, audience: 'role', value: tier.roles, payload }),
    }).catch(() => {})
    if (staffIds.size) {
      fetch(`${base}/functions/v1/send-push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ school_id: x.school_id, audience: 'staff', value: [...staffIds], payload }),
      }).catch(() => {})
    }

    // Tier 3 also pings the parent directly.
    if (tier.level === 3 && stu.parent_phone) {
      sendWhatsApp(stu.parent_phone,
        `*OVERDUE RETURN*\n\n${name} (${cls}) was due back from ${x.destination ?? 'their exeat'} and is now ${hrs} hours late.\n\nPlease ensure they return to school immediately or contact the school office.`
      ).then(() => {}, () => {})
    }

    await db.from('exeat_requests').update({ escalation_level: tier.level }).eq('id', x.id)
    escalated++
  }

  return NextResponse.json({ ok: true, escalated, checked_at: new Date().toISOString() })
}

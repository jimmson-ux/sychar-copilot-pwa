/**
 * tod-reminder — nagging reminder for the Teacher on Duty daily report.
 *
 * Run on a cron (e.g. 16:00 + 18:00 + 20:00 EAT). For each school's on-duty
 * teacher(s) today who have NOT submitted their tod_daily_report:
 *   1. Web-push a nag to the teacher.
 *   2. Escalate a per-school "unfilled TOD report" summary to deputy + principal.
 *
 * Auth: x-cron-secret (matches CRON_SECRET). Uses send-push.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  const origin = req.headers.get('origin')
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } })

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Today in EAT.
  const nowEAT = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const today = nowEAT.toISOString().slice(0, 10)

  async function push(schoolId: string, audience: string, value: string | string[], title: string, body: string) {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ audience, value, school_id: schoolId, payload: { title, body, url: '/dashboard/duty-appraisals', tag: 'tod-reminder', renotify: true } }),
    }).catch(() => {})
  }

  try {
    // Today's duty assignments.
    const { data: duties } = await svc
      .from('duty_roster')
      .select('school_id, teacher_id')
      .eq('duty_date', today)

    const bySchool = new Map<string, Set<string>>()
    for (const d of (duties ?? []) as { school_id: string; teacher_id: string }[]) {
      if (!d.teacher_id) continue
      if (!bySchool.has(d.school_id)) bySchool.set(d.school_id, new Set())
      bySchool.get(d.school_id)!.add(d.teacher_id)
    }

    let nagged = 0
    let escalated = 0

    for (const [schoolId, teacherIds] of bySchool) {
      // Which of today's duty teachers already submitted?
      const { data: submitted } = await svc
        .from('tod_daily_report')
        .select('teacher_id')
        .eq('school_id', schoolId)
        .eq('duty_date', today)
        .eq('status', 'submitted')
      const done = new Set((submitted ?? []).map((r: { teacher_id: string }) => r.teacher_id))

      const unfilled = [...teacherIds].filter((t) => !done.has(t))
      if (!unfilled.length) continue

      // Nag each duty teacher.
      for (const t of unfilled) {
        await push(schoolId, 'staff', t, 'Duty report pending',
          'Please complete your Teacher-on-Duty daily report before you leave.')
        nagged++
      }

      // Escalate a summary to deputy + principal.
      const { data: names } = await svc
        .from('staff_records')
        .select('full_name')
        .in('id', unfilled)
      const list = (names ?? []).map((n: { full_name: string }) => n.full_name).join(', ')
      await push(schoolId, 'role', ['principal', 'deputy_principal', 'deputy_principal_admin'],
        'Unfilled TOD report(s)',
        `${unfilled.length} duty teacher(s) have not submitted today's report: ${list}`)
      escalated++
    }

    return json({ ok: true, date: today, schools: bySchool.size, nagged, escalated })
  } catch (err) {
    console.error('[tod-reminder]', err)
    return json({ error: 'tod-reminder failed' }, 500)
  }
})
